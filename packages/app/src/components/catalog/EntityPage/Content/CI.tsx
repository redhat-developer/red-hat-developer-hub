import { Entity } from '@backstage/catalog-model';
import { EntitySwitch } from '@backstage/plugin-catalog';
import {
  EntityGithubActionsContent,
  isGithubActionsAvailable,
} from '@backstage/plugin-github-actions';
import {
  isTektonCIAvailable,
  LatestPipelineRun,
} from '@janus-idp/backstage-plugin-tekton';
import {
  EntityGitlabMergeRequestsTable,
  isGitlabAvailable,
} from '@immobiliarelabs/backstage-plugin-gitlab';
import { Grid } from '@material-ui/core';
import React from 'react';

const ifCIs: ((e: Entity) => boolean)[] = [
  isGithubActionsAvailable,
  isGitlabAvailable,
  isTektonCIAvailable,
];

const ifTektonAndGitlabCIs: ((e: Entity) => boolean)[] = [
  isGitlabAvailable,
  isTektonCIAvailable,
];

const ifTektonAndGithubActionsCIs: ((e: Entity) => boolean)[] = [
  isGithubActionsAvailable,
  isTektonCIAvailable,
];

const ifGithubQActionsAndGitlabCIs: ((e: Entity) => boolean)[] = [
  isGitlabAvailable,
  isGithubActionsAvailable,
];

export const isCIsAvailable = (e: Entity) => ifCIs.some(f => f(e));

export const areAllCIsAvailable = (e: Entity) => ifCIs.every(f => f(e));

export const areGithubActionsAndGitlabCIsAvailable = (e: Entity) =>
  ifGithubQActionsAndGitlabCIs.every(f => f(e));

export const areGithubActionsAndTektonCIsAvailable = (e: Entity) =>
  ifTektonAndGithubActionsCIs.every(f => f(e));

export const areTektonAndGitlabCIsAvailable = (e: Entity) =>
  ifTektonAndGitlabCIs.every(f => f(e));

export const ciContent = (
  <Grid container spacing={3} justifyContent="space-evenly">
    <EntitySwitch>
      <EntitySwitch.Case if={areAllCIsAvailable}>
        <Grid item xs={12}>
          <EntityGithubActionsContent />
        </Grid>
        <Grid item xs={12}>
          <EntityGitlabMergeRequestsTable />
        </Grid>
        <Grid item xs={12}>
          <LatestPipelineRun linkTekton />
        </Grid>
      </EntitySwitch.Case>

      <EntitySwitch.Case if={areGithubActionsAndGitlabCIsAvailable}>
        <Grid item xs={12}>
          <EntityGithubActionsContent />
        </Grid>
        <Grid item xs={12}>
          <EntityGitlabMergeRequestsTable />
        </Grid>
      </EntitySwitch.Case>

      <EntitySwitch.Case if={areGithubActionsAndTektonCIsAvailable}>
        <Grid item xs={12}>
          <EntityGithubActionsContent />
        </Grid>
        <Grid item xs={12}>
          <LatestPipelineRun linkTekton />
        </Grid>
      </EntitySwitch.Case>

      <EntitySwitch.Case if={areTektonAndGitlabCIsAvailable}>
        <Grid item xs={12}>
          <EntityGitlabMergeRequestsTable />
        </Grid>
        <Grid item xs={12}>
          <LatestPipelineRun linkTekton />
        </Grid>
      </EntitySwitch.Case>

      <EntitySwitch.Case if={isGithubActionsAvailable}>
        <Grid item xs={12}>
          <EntityGithubActionsContent />
        </Grid>
      </EntitySwitch.Case>

      <EntitySwitch.Case if={isGitlabAvailable}>
        <Grid item xs={12}>
          <EntityGitlabMergeRequestsTable />
        </Grid>
      </EntitySwitch.Case>

      <EntitySwitch.Case if={isTektonCIAvailable}>
        <Grid item xs={12}>
          <LatestPipelineRun linkTekton />
        </Grid>
      </EntitySwitch.Case>
    </EntitySwitch>
  </Grid>
);
