const leadModel = require('../models/leadgen.model');
const { runDailyLeadGeneration } = require('../services/leadgen.service');

const getLeads = async (req, res) => {
  try {
    const { limit = 50, offset = 0, status, startDate, endDate } = req.query;
    const leads = await leadModel.findAll({
      limit: parseInt(limit), offset: parseInt(offset), status, startDate, endDate,
    });
    res.json({ data: leads });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await leadModel.getStats();
    res.json({ data: stats });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
};

const getLead = async (req, res) => {
  try {
    const lead = await leadModel.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: { message: 'Lead not found' } });
    res.json({ data: lead });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
};

let leadgenRunning = false;

const triggerRun = async (req, res) => {
  try {
    if (leadgenRunning) return res.status(429).json({ error: { message: 'Lead generation already running' } });
    leadgenRunning = true;
    res.json({ message: 'Lead generation started', status: 'running' });
    runDailyLeadGeneration()
      .catch(err => console.error('[LEADGEN] Manual run failed:', err.message))
      .finally(() => { leadgenRunning = false; });
  } catch (err) {
    leadgenRunning = false;
    res.status(500).json({ error: { message: err.message } });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const lead = await leadModel.findByUnsubscribeToken(req.params.token);
    if (!lead) return res.status(404).send('<h1>Link expired or invalid</h1>');
    await leadModel.update(lead.id, { status: 'unsubscribed' });
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h1>Unsubscribed</h1><p>You won\'t receive any more emails from us.</p></body></html>');
  } catch (err) {
    res.status(500).send('<h1>Something went wrong</h1>');
  }
};

module.exports = { getLeads, getStats, getLead, triggerRun, unsubscribe };
