import * as http from 'http';

const AGENT_CARDS = {
  scout: {
    name: 'BeeScout',
    description: 'Discovers social impact ventures for funding on XRPL',
    url: 'http://localhost:3002',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [
      {
        id: 'search_projects',
        name: 'Search Impact Ventures',
        description: 'Find social impact ventures matching user criteria',
        tags: ['impact', 'search', 'discovery'],
        examples: ['Find WASH ventures in South Asia', 'Show me Agriculture ventures in Africa'],
      },
    ],
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
  },
  analyst: {
    name: 'BeeAnalyst',
    description: 'Verifies impact ventures on XRPL using on-chain data, credentials, and oracles',
    url: 'http://localhost:3002',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [
      {
        id: 'verify_project',
        name: 'Verify Impact Venture',
        description: 'Analyze XRPL transaction history, publish Oracle trust score, issue Credential',
        tags: ['verification', 'xrpl', 'oracle', 'credentials'],
        examples: ['Verify Solar Sister', 'Check Bridges to Prosperity legitimacy'],
      },
    ],
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
  },
  funder: {
    name: 'BeeFunder',
    description: 'Creates conditional escrow payments on XRPL for verified impact ventures',
    url: 'http://localhost:3002',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [
      {
        id: 'create_escrow',
        name: 'Create Impact Escrow',
        description: 'Lock funds in XRPL escrow with crypto-condition from verification',
        tags: ['escrow', 'xrpl', 'payments', 'funding'],
        examples: ['Fund Hello Tractor with 50 XRP'],
      },
      {
        id: 'release_escrow',
        name: 'Release Impact Escrow',
        description: 'Release escrowed funds after impact verification confirmation',
        tags: ['escrow', 'release', 'verification'],
        examples: ['Release escrow for Drinkwell'],
      },
    ],
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
  },
};

export function startA2AServer(port = 3002) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/.well-known/agent.json') {
      res.end(JSON.stringify({
        name: 'BumbleBee',
        description: 'Autonomous agents for social impact funding on XRPL',
        url: `http://localhost:${port}`,
        version: '1.0.0',
        capabilities: { streaming: false, pushNotifications: false },
        skills: [
          ...AGENT_CARDS.scout.skills,
          ...AGENT_CARDS.analyst.skills,
          ...AGENT_CARDS.funder.skills,
        ],
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
      }, null, 2));
    } else if (req.url === '/agents') {
      res.end(JSON.stringify(AGENT_CARDS, null, 2));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`A2A port ${port} in use, trying ${port + 1}...`);
      server.listen(port + 1, () => {
        console.log(`A2A Agent Cards: http://localhost:${port + 1}/.well-known/agent.json`);
      });
    }
  });

  server.listen(port, () => {
    console.log(`A2A Agent Cards: http://localhost:${port}/.well-known/agent.json`);
  });
}
