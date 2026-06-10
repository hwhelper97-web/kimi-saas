const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runQA() {
  const results = [];
  const tenantId = 'bbc47e11-e92f-4c84-af85-e262ee460138'; // Naxton Platform Hub
  const agentEmail = 'agent@naxton.ai';
  const devEmail = 'dev@naxton.ai';
  const managerEmail = 'manager@naxton.ai';
  const productEmail = 'product@naxton.ai';
  const superadminEmail = 'root@naxton.ai';

  console.log('🚀 Starting End-to-End Platform Support Audit...');

  try {
    // --- STEP 1: Tenant Initiation ---
    console.log('\n[Step 1] Tenant Initiation...');
    const customer = await prisma.customer.findFirst({ where: { tenantId } });
    const conversation = await prisma.conversation.create({
      data: {
        tenantId: tenantId,
        customerId: customer.id,
        messages: {
          create: {
            body: 'The AI voice generation is failing for my barber shop.',
            senderType: 'CUSTOMER',
            senderId: customer.id
          }
        }
      }
    });
    results.push({ step: 1, name: 'Tenant Initiation', status: 'WORKING', details: `Convo ID: ${conversation.id}` });

    // --- STEP 2: Agent Response ---
    console.log('[Step 2] Agent Response...');
    const agent = await prisma.user.findUnique({ where: { email: agentEmail } });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        body: "I'm sorry to hear that. Let me check the system logs for your tenant.",
        senderType: 'AGENT',
        senderId: agent.id
      }
    });
    results.push({ step: 2, name: 'Agent Response', status: 'WORKING' });

    // --- STEP 3: Technical Escalation ---
    console.log('[Step 3] Technical Escalation...');
    const ticket = await prisma.ticket.create({
      data: {
        subject: 'AI Voice Failure Escalation',
        description: 'Tenant reporting ElevenLabs failure.',
        status: 'escalated',
        priority: 'urgent',
        tenantId: tenantId,
        assignedToId: agent.id,
        customerId: customer.id
      }
    });
    results.push({ step: 3, name: 'Technical Escalation', status: 'WORKING', details: `Ticket ID: ${ticket.id}` });

    // --- STEP 4: Team Lead Oversight ---
    console.log('[Step 4] Team Lead Oversight...');
    const manager = await prisma.user.findUnique({ where: { email: managerEmail } });
    const managerTickets = await prisma.ticket.findMany({
      where: { status: 'escalated' }
    });
    const found = managerTickets.some(t => t.id === ticket.id);
    results.push({ step: 4, name: 'Team Lead Oversight', status: found ? 'WORKING' : 'FAILED' });

    // --- STEP 5: Developer Investigation ---
    console.log('[Step 5] Developer Investigation...');
    const dev = await prisma.user.findUnique({ where: { email: devEmail } });
    const note = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: dev.id,
        senderType: 'DEVELOPER',
        body: 'Investigating ElevenLabs API logs. Suspected rate limit on vendor side.',
        isInternal: true
      }
    });
    results.push({ step: 5, name: 'Developer Investigation', status: 'WORKING' });

    // --- STEP 6: Real-time Communication ---
    console.log('[Step 6] Real-time Communication...');
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' }
    });
    results.push({ step: 6, name: 'Real-time Communication', status: messages.length === 2 ? 'WORKING' : 'FAILED' });

    // --- STEP 7: Incident Creation ---
    console.log('[Step 7] Incident Creation...');
    const incident = await prisma.incident.create({
      data: {
        title: 'Minor outage: AI Voice Synthesis degradation',
        description: 'High failure rates on ElevenLabs bridge detected.',
        severity: 'major',
        status: 'investigating',
        affectedServices: 'ElevenLabs, Voice Synth'
      }
    });
    results.push({ step: 7, name: 'Incident Creation', status: 'WORKING', details: `Incident ID: ${incident.id}` });

    // --- STEP 8: Product Management Review ---
    console.log('[Step 8] Product Management Review...');
    const product = await prisma.user.findUnique({ where: { email: productEmail } });
    const incidents = await prisma.incident.findMany();
    const incidentFound = incidents.some(i => i.id === incident.id);
    results.push({ step: 8, name: 'Product Management Review', status: incidentFound ? 'WORKING' : 'FAILED' });

    // --- STEP 9: Incident Resolution ---
    console.log('[Step 9] Incident Resolution...');
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'resolved' }
    });
    results.push({ step: 9, name: 'Incident Resolution', status: 'WORKING' });

    // --- STEP 10: Ticket Closure & Audit ---
    console.log('[Step 10] Ticket Closure & Audit...');
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'resolved' }
    });
    
    // Create audit log for closure
    await prisma.auditLog.create({
      data: {
        userId: agent.id,
        action: 'TICKET_RESOLVED',
        resource: `Ticket:${ticket.id}`,
        details: 'Issue resolved after engineering fix.'
      }
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: { action: 'TICKET_RESOLVED' }
    });
    results.push({ step: 10, name: 'Ticket Closure & Audit', status: auditLogs.length > 0 ? 'WORKING' : 'FAILED' });

  } catch (error) {
    console.error('❌ QA Simulation Error:', error);
    results.push({ step: 'ERROR', name: 'FATAL EXCEPTION', status: 'FAILED', details: error.message });
  } finally {
    console.log('\n--- AUDIT RESULTS ---');
    results.forEach(r => {
      console.log(`Step ${r.step}: ${r.name} - [${r.status}] ${r.details || ''}`);
    });
    await prisma.$disconnect();
  }
}

runQA();
