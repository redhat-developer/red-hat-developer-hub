import {
  CacheManager,
  DatabaseManager,
  HostDiscovery,
  ServerTokenManager,
  ServiceBuilder,
  UrlReaders,
  createServiceBuilder,
  createStatusCheckRouter,
  getRootLogger,
  loadBackendConfig,
  notFoundHandler,
  useHotMemoize,
} from '@backstage/backend-common';
import {
  BackendPluginProvider,
  LegacyPluginEnvironment as PluginEnvironment,
  PluginManager,
} from '@backstage/backend-plugin-manager';
import { TaskScheduler } from '@backstage/backend-tasks';
import { Config } from '@backstage/config';
import { DefaultIdentityClient } from '@backstage/plugin-auth-node';
import { DefaultEventBroker } from '@backstage/plugin-events-backend';
import { ServerPermissionClient } from '@backstage/plugin-permission-node';
import { createRouter as dynamicPluginsInfoRouter } from '@internal/plugin-dynamic-plugins-info-backend';
import { createRouter as scalprumRouter } from '@internal/plugin-scalprum-backend';
import { RequestHandler, Router } from 'express';
import { metricsHandler } from './metrics';
import app from './plugins/app';
import auth from './plugins/auth';
import catalog from './plugins/catalog';
import events from './plugins/events';
import permission from './plugins/permission';
import proxy from './plugins/proxy';
import scaffolder from './plugins/scaffolder';
import search from './plugins/search';

// TODO(davidfestal): The following import is a temporary workaround for a bug
// in the upstream @backstage/backend-plugin-manager package.
//
// It should be removed as soon as the upstream package is fixed and released.
// see https://github.com/janus-idp/backstage-showcase/pull/600
import { CommonJSModuleLoader } from './loader/CommonJSModuleLoader';

function makeCreateEnv(config: Config, pluginProvider: BackendPluginProvider) {
  const root = getRootLogger();
  const reader = UrlReaders.default({ logger: root, config });
  const discovery = HostDiscovery.fromConfig(config);
  const cacheManager = CacheManager.fromConfig(config);
  const databaseManager = DatabaseManager.fromConfig(config, { logger: root });
  const tokenManager = ServerTokenManager.fromConfig(config, { logger: root });
  const taskScheduler = TaskScheduler.fromConfig(config, { databaseManager });
  const eventBroker = new DefaultEventBroker(root);

  const identity = DefaultIdentityClient.create({
    discovery,
  });
  const permissions = ServerPermissionClient.fromConfig(config, {
    discovery,
    tokenManager,
  });

  root.info(`Created UrlReader ${JSON.stringify(reader)}`);

  return (plugin: string): PluginEnvironment => {
    const logger = root.child({ type: 'plugin', plugin });
    const database = databaseManager.forPlugin(plugin);
    const cache = cacheManager.forPlugin(plugin);
    const scheduler = taskScheduler.forPlugin(plugin);
    return {
      logger,
      database,
      cache,
      config,
      reader,
      discovery,
      tokenManager,
      scheduler,
      permissions,
      identity,
      eventBroker,
      pluginProvider,
    };
  };
}

async function addPlugin(args: {
  plugin: string;
  apiRouter: Router;
  createEnv: ReturnType<typeof makeCreateEnv>;
  router: (env: PluginEnvironment) => Promise<Router>;
}): Promise<void> {
  const { plugin, apiRouter, createEnv, router } = args;

  const pluginEnv: PluginEnvironment = useHotMemoize(module, () =>
    createEnv(plugin),
  );
  apiRouter.use(`/${plugin}`, await router(pluginEnv));
}

async function addRouter(args: {
  service: ServiceBuilder;
  root: string;
  router: RequestHandler | Router;
}): Promise<void> {
  const { service, root, router } = args;

  service.addRouter(root, router);
}

async function main() {
  const logger = getRootLogger();
  const config = await loadBackendConfig({
    argv: process.argv,
    logger,
  });
  const pluginManager = await PluginManager.fromConfig(
    config,
    logger,
    undefined,
    new CommonJSModuleLoader(logger),
  );
  const createEnv = makeCreateEnv(config, pluginManager);

  const appEnv = useHotMemoize(module, () => createEnv('app'));

  const apiRouter = Router();

  // Scalprum frontend plugins provider
  await addPlugin({
    plugin: 'scalprum',
    apiRouter,
    createEnv,
    router: env =>
      scalprumRouter({
        logger: env.logger,
        pluginManager,
        discovery: env.discovery,
      }),
  });

  // Dynamic plugins info provider
  await addPlugin({
    plugin: 'dynamic-plugins-info',
    apiRouter,
    createEnv,
    router: env =>
      dynamicPluginsInfoRouter({
        logger: env.logger,
        pluginManager,
      }),
  });

  // Required core plugins
  await addPlugin({ plugin: 'proxy', apiRouter, createEnv, router: proxy });
  await addPlugin({ plugin: 'auth', apiRouter, createEnv, router: auth });
  await addPlugin({ plugin: 'catalog', apiRouter, createEnv, router: catalog });
  await addPlugin({ plugin: 'search', apiRouter, createEnv, router: search });
  await addPlugin({
    plugin: 'scaffolder',
    apiRouter,
    createEnv,
    router: scaffolder,
  });
  await addPlugin({ plugin: 'events', apiRouter, createEnv, router: events });
  await addPlugin({
    plugin: 'permission',
    apiRouter,
    createEnv,
    router: env =>
      permission(env, {
        getPluginIds: () => [
          'catalog', // Add the other required static plugins here
          ...(pluginManager
            .backendPlugins()
            .map(p => {
              if (p.installer.kind !== 'legacy') {
                return undefined;
              }
              return p.installer.router?.pluginID;
            })
            .filter(p => p !== undefined) as string[]),
        ],
      }),
  });

  // Load dynamic plugins
  for (const plugin of pluginManager.backendPlugins()) {
    if (plugin.installer.kind === 'legacy') {
      const pluginRouter = plugin.installer.router;
      if (pluginRouter !== undefined) {
        await addPlugin({
          plugin: pluginRouter.pluginID,
          apiRouter,
          createEnv,
          router: pluginRouter.createPlugin,
        });
      }
    }
  }

  // Add backends ABOVE this line; this 404 handler is the catch-all fallback
  apiRouter.use(notFoundHandler());

  const service = createServiceBuilder(module).loadConfig(config);

  // Required core routers
  await addRouter({
    service,
    root: '/api',
    router: apiRouter,
  });
  await addRouter({
    service,
    root: '',
    router: await createStatusCheckRouter(appEnv),
  });
  await addRouter({
    service,
    root: '',
    router: metricsHandler(),
  });
  await addRouter({
    service,
    root: '',
    router: await app(appEnv),
  });

  await service.start().catch(err => {
    console.log(err);
    process.exit(1);
  });
}

module.hot?.accept();
main().catch(error => {
  console.error('Backend failed to start up', error);
  process.exit(1);
});
