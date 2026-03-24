require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Seeding database...\n');

    // Create demo user
    const passwordHash = await bcrypt.hash('demo1234', 12);
    const { rows: [user] } = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, company, role, email_verified)
       VALUES ('demo@monkflow.io', $1, 'Nathan', 'Linder', 'MonkFlow', 'owner', true)
       ON CONFLICT (email) DO UPDATE SET first_name = 'Nathan'
       RETURNING *`,
      [passwordHash]
    );
    console.log(`  User: ${user.email} (password: demo1234)`);

    // Availability rules (Mon-Fri 9-5)
    for (let day = 1; day <= 5; day++) {
      await client.query(
        `INSERT INTO availability_rules (user_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, '09:00', '17:00')
         ON CONFLICT (user_id, day_of_week) DO NOTHING`,
        [user.id, day]
      );
    }
    console.log('  Availability rules created');

    // Workflows
    const workflows = [
      { name: 'Lead Qualification Pipeline', type: 'webhook', status: 'active', desc: 'Automatically qualify inbound leads using AI analysis' },
      { name: 'Customer Onboarding', type: 'event', status: 'active', desc: 'Welcome sequence for new customers' },
      { name: 'Daily Report Generator', type: 'schedule', status: 'active', desc: 'Generate and email daily business reports', cron: '0 8 * * *' },
      { name: 'Support Ticket Router', type: 'webhook', status: 'active', desc: 'Route support tickets to the right team using AI' },
      { name: 'Invoice Processor', type: 'manual', status: 'paused', desc: 'Process and categorize incoming invoices' },
      { name: 'Social Media Monitor', type: 'schedule', status: 'draft', desc: 'Monitor social mentions and alert on trends', cron: '*/30 * * * *' },
    ];

    for (const wf of workflows) {
      await client.query(
        `INSERT INTO workflows (user_id, name, description, trigger_type, status, cron_expression, total_runs, success_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, wf.name, wf.desc, wf.type, wf.status, wf.cron || null,
         Math.floor(Math.random() * 500), (85 + Math.random() * 15).toFixed(2)]
      );
    }
    console.log(`  ${workflows.length} workflows created`);

    // AI Agents
    const agents = [
      { name: 'Content Writer', type: 'text_generation', icon: '✍️', desc: 'Generate blog posts, emails, and marketing copy', prompt: 'You are an expert content writer. Generate high-quality, engaging content.' },
      { name: 'Lead Scorer', type: 'classification', icon: '🎯', desc: 'Score and classify inbound leads', prompt: 'You are a lead scoring expert. Analyze lead data and return a score from 0-100 with reasoning.' },
      { name: 'Data Analyst', type: 'analysis', icon: '📊', desc: 'Analyze data sets and generate insights', prompt: 'You are a data analyst. Analyze the provided data and generate actionable insights.' },
      { name: 'Email Responder', type: 'text_generation', icon: '📧', desc: 'Draft professional email responses', prompt: 'You are an email communication expert. Draft professional, concise email responses.' },
      { name: 'Code Reviewer', type: 'analysis', icon: '🔍', desc: 'Review code for quality and security', prompt: 'You are a senior software engineer. Review code for bugs, security issues, and best practices.' },
      { name: 'Sentiment Analyzer', type: 'classification', icon: '😊', desc: 'Analyze customer feedback sentiment', prompt: 'Analyze the sentiment of the provided text. Return: sentiment (positive/negative/neutral), confidence score, and key themes.' },
    ];

    for (const agent of agents) {
      await client.query(
        `INSERT INTO agents (user_id, name, description, icon, agent_type, system_prompt, total_tasks, accuracy_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, agent.name, agent.desc, agent.icon, agent.type, agent.prompt,
         Math.floor(Math.random() * 200), (80 + Math.random() * 20).toFixed(2)]
      );
    }
    console.log(`  ${agents.length} agents created`);

    // Notifications
    const notifs = [
      { type: 'workflow', title: 'Workflow Completed', msg: 'Lead Qualification Pipeline completed successfully', icon: 'check-circle' },
      { type: 'agent', title: 'Agent Task Done', msg: 'Content Writer finished generating blog post', icon: 'cpu' },
      { type: 'appointment', title: 'New Appointment', msg: 'Sarah Chen booked a consultation for next Monday', icon: 'calendar' },
      { type: 'system', title: 'System Update', msg: 'MonkFlow v2.1 released with new features', icon: 'info' },
      { type: 'team', title: 'Team Update', msg: 'Alex Rivera joined your team', icon: 'users' },
    ];

    for (const n of notifs) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, icon) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, n.type, n.title, n.msg, n.icon]
      );
    }
    console.log(`  ${notifs.length} notifications created`);

    // Team members
    const members = [
      { email: 'sarah@monkflow.io', name: 'Sarah Chen', role: 'admin', status: 'active' },
      { email: 'alex@monkflow.io', name: 'Alex Rivera', role: 'editor', status: 'active' },
      { email: 'jordan@example.com', name: 'Jordan Lee', role: 'viewer', status: 'pending' },
    ];

    for (const m of members) {
      await client.query(
        `INSERT INTO team_members (team_owner_id, email, name, role, status) VALUES ($1, $2, $3, $4, $5)`,
        [user.id, m.email, m.name, m.role, m.status]
      );
    }
    console.log(`  ${members.length} team members created`);

    console.log('\nSeeding complete!');

  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
