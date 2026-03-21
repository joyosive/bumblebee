import type { Plugin } from '@elizaos/core';
import { searchProjectsAction } from './actions/searchProjects.js';
import { verifyProjectAction } from './actions/verifyProject.js';
import { createEscrowAction } from './actions/createEscrow.js';
import { releaseEscrowAction } from './actions/releaseEscrow.js';

export const xrplPlugin: Plugin = {
  name: 'xrpl-bumblebee',
  description: 'XRPL integration for BumbleBee — escrow, oracle, credentials, trust scoring',
  actions: [
    searchProjectsAction,
    verifyProjectAction,
    createEscrowAction,
    releaseEscrowAction,
  ],
  providers: [],
  evaluators: [],
};
