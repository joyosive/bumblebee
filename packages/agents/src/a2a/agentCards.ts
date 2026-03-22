import * as http from 'http';

const AGENT_CARDS = {
  facilitator: {
    name: 'FacilitatorBee',
    description: 'Onboards NGOs, receives campaign requests, tracks milestone progress',
    url: 'http://localhost:3002',
    version: '2.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'campaign_intake', name: 'Campaign Intake', description: 'Receive and store NGO campaign requests', tags: ['ngo', 'campaign'], examples: ['Submit a funding campaign'] }],
    defaultInputModes: ['text'], defaultOutputModes: ['text'],
  },
  evaluator: {
    name: 'EvaluatorBee',
    description: 'Reviews and scores incoming NGO campaigns for viability',
    url: 'http://localhost:3002',
    version: '2.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'evaluate_campaign', name: 'Evaluate Campaign', description: 'Score campaign viability and set milestones', tags: ['evaluation', 'scoring'], examples: ['Evaluate education campaign'] }],
    defaultInputModes: ['text'], defaultOutputModes: ['text'],
  },
  treasury: {
    name: 'TreasuryBee',
    description: 'Manages donor pool escrow, creates milestone escrows, releases funds on XRPL',
    url: 'http://localhost:3002',
    version: '2.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'manage_escrows', name: 'Manage Escrows', description: 'Create, release, and cancel milestone escrows on XRPL', tags: ['escrow', 'xrpl', 'treasury'], examples: ['Allocate funds for campaign'] }],
    defaultInputModes: ['text'], defaultOutputModes: ['text'],
  },
  verifier: {
    name: 'VerifierBee',
    description: 'Reviews evidence submissions and approves or rejects milestones',
    url: 'http://localhost:3002',
    version: '2.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'verify_evidence', name: 'Verify Evidence', description: 'Review milestone evidence and approve/reject', tags: ['verification', 'evidence'], examples: ['Review milestone 1 evidence'] }],
    defaultInputModes: ['text'], defaultOutputModes: ['text'],
  },
  reviewer: {
    name: 'ReviewerBee',
    description: 'Calculates trust scores and publishes on XRPL via Oracle',
    url: 'http://localhost:3002',
    version: '2.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'trust_score', name: 'Trust Score', description: 'Calculate and publish campaign trust score on-chain', tags: ['trust', 'oracle', 'xrpl'], examples: ['Score completed campaign'] }],
    defaultInputModes: ['text'], defaultOutputModes: ['text'],
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
        version: '2.0.0',
        capabilities: { streaming: false, pushNotifications: false },
        skills: [
          ...AGENT_CARDS.facilitator.skills,
          ...AGENT_CARDS.evaluator.skills,
          ...AGENT_CARDS.treasury.skills,
          ...AGENT_CARDS.verifier.skills,
          ...AGENT_CARDS.reviewer.skills,
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
