import type { Action } from '@elizaos/core';
import { searchVentures, VENTURES } from '../../../data/ventures.js';
import { emitEvent } from '../../../bridge/websocket.js';

export const searchProjectsAction: Action = {
  name: 'SEARCH_VENTURES',
  description: 'Search for social impact ventures available for funding on BumbleBee',
  similes: [
    'FIND_VENTURES',
    'LIST_VENTURES',
    'BROWSE_VENTURES',
    'SHOW_VENTURES',
    'FIND_PROJECTS',
    'SEARCH_PROJECTS',
  ],

  validate: async (_runtime, message) => {
    const text = (message.content?.text || '').toLowerCase();
    const keywords = [
      'venture', 'fund', 'project', 'impact', 'find', 'search',
      'water', 'solar', 'energy', 'agriculture', 'education',
      'healthcare', 'environment', 'donate', 'help', 'browse',
    ];
    return keywords.some(k => text.includes(k));
  },

  handler: async (_runtime, message, _state, _options, callback) => {
    const text = message.content?.text || '';

    emitEvent({
      agent: 'scout',
      type: 'work',
      message: `Searching ventures for: "${text}"`,
      data: { query: text },
    });

    let results = searchVentures(text);

    if (results.length === 0) {
      results = VENTURES;
    }

    const ventureList = results.map((v, i) =>
      `**${i + 1}. ${v.name}** (${v.countries})\n` +
      `   ${v.description}\n` +
      `   Sector: ${v.sector} | Type: ${v.type} | HQ: ${v.hq}` +
      (v.yearFounded ? ` | Founded: ${v.yearFounded}` : '') +
      (v.website ? ` | Website: ${v.website}` : '') +
      `\n   Communities Served: ${v.communitiesServed}`
    ).join('\n\n');

    const responseText =
      `I found ${results.length} impact venture${results.length !== 1 ? 's' : ''}:\n\n` +
      `${ventureList}\n\n` +
      `Which venture would you like to support? I can verify any of these for you first.`;

    emitEvent({
      agent: 'scout',
      type: 'complete',
      message: `Found ${results.length} ventures`,
      data: { ventureCount: results.length, ventureIds: results.map(v => v.id) },
    });

    if (callback) {
      await callback({ text: responseText, actions: ['SEARCH_VENTURES'] });
    }

    return { success: true, text: responseText };
  },

  examples: [
    [
      {
        user: 'user',
        content: { text: 'Find me impact ventures to fund' },
      },
      {
        user: 'agent',
        content: { text: 'I found 40 impact ventures:\n\n**1. Solar Sister** (Nigeria, Tanzania, Uganda)\n   Recruits and trains women entrepreneurs in Africa to distribute clean energy products...' },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Show me clean water projects' },
      },
      {
        user: 'agent',
        content: { text: 'I found 1 impact venture:\n\n**1. Drinkwell** (Bangladesh, Cambodia, India)\n   Provides safe drinking water to communities in South and Southeast Asia...' },
      },
    ],
    [
      {
        user: 'user',
        content: { text: 'Search for agriculture ventures in Africa' },
      },
      {
        user: 'agent',
        content: { text: 'I found several impact ventures:\n\n**1. Digital Green** (India, Ethiopia, Tanzania, Niger)\n   Uses AI and digital video to spread agricultural best practices...' },
      },
    ],
  ],
};
