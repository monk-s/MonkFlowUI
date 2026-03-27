const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
  : path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// List projects for current user (or all if admin/owner)
exports.listProjects = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = p.id) as file_count,
        (SELECT pu.message FROM project_updates pu WHERE pu.project_id = p.id ORDER BY pu.created_at DESC LIMIT 1) as latest_update
      FROM projects p
      WHERE p.user_id = $1
      ORDER BY p.updated_at DESC`,
      [req.user.userId]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};

// List ALL projects (admin only — for owner to manage all client projects)
exports.listAllProjects = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.email as client_email, u.first_name as client_first_name, u.last_name as client_last_name,
        (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = p.id) as file_count,
        (SELECT pu.message FROM project_updates pu WHERE pu.project_id = p.id ORDER BY pu.created_at DESC LIMIT 1) as latest_update
      FROM projects p
      LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.updated_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};

// Get single project with files and updates
exports.getProject = async (req, res, next) => {
  try {
    const { rows: [project] } = await db.query(
      'SELECT * FROM projects WHERE id = $1',
      [req.params.id]
    );
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    // Check access: owner can see all, client can only see their own
    const isOwner = req.user.userId === process.env.OWNER_USER_ID;
    if (!isOwner && project.user_id !== req.user.userId) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const { rows: files } = await db.query(
      'SELECT id, original_name, file_size, mime_type, created_at FROM project_files WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    const { rows: updates } = await db.query(
      'SELECT * FROM project_updates WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ ...project, files, updates });
  } catch (err) {
    next(err);
  }
};

// Create project (admin/owner only)
exports.createProject = async (req, res, next) => {
  try {
    const { name, description, userId, status } = req.body;
    if (!name || !userId) {
      return res.status(400).json({ error: { message: 'Name and userId are required' } });
    }

    const { rows: [project] } = await db.query(
      `INSERT INTO projects (name, description, user_id, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || '', userId, status || 'discovery']
    );

    // Create initial update
    await db.query(
      'INSERT INTO project_updates (project_id, status, message, created_by) VALUES ($1, $2, $3, $4)',
      [project.id, project.status, `Project "${name}" created`, req.user.userId]
    );

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
};

// Update project status/details (admin/owner only)
exports.updateProject = async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    values.push(req.params.id);
    const { rows: [project] } = await db.query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    // Log status change
    if (status) {
      const statusLabels = { discovery: 'Discovery', in_progress: 'In Progress', review: 'Under Review', delivered: 'Delivered', completed: 'Completed' };
      await db.query(
        'INSERT INTO project_updates (project_id, status, message, created_by) VALUES ($1, $2, $3, $4)',
        [project.id, status, `Status changed to ${statusLabels[status] || status}`, req.user.userId]
      );
    }

    res.json(project);
  } catch (err) {
    next(err);
  }
};

// Add a status update message
exports.addUpdate = async (req, res, next) => {
  try {
    const { message, status } = req.body;
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });

    const { rows: [update] } = await db.query(
      'INSERT INTO project_updates (project_id, status, message, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, status || null, message, req.user.userId]
    );

    // Update project timestamp
    await db.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.status(201).json(update);
  } catch (err) {
    next(err);
  }
};

// Upload file to project
exports.uploadFile = async (req, res, next) => {
  try {
    // Raw body file upload (multipart handled manually for simplicity)
    // We'll use a simple approach: base64 encoded file in JSON body
    const { filename, data, mimeType } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: { message: 'Filename and data are required' } });
    }

    // Verify project exists
    const { rows: [project] } = await db.query('SELECT id FROM projects WHERE id = $1', [req.params.id]);
    if (!project) return res.status(404).json({ error: { message: 'Project not found' } });

    // Create project upload subdirectory
    const projectDir = path.join(UPLOAD_DIR, req.params.id);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Save file
    const fileId = uuidv4();
    const ext = path.extname(filename) || '';
    const savedFilename = `${fileId}${ext}`;
    const filePath = path.join(projectDir, savedFilename);

    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, buffer);

    // Record in database
    const { rows: [fileRecord] } = await db.query(
      `INSERT INTO project_files (project_id, filename, original_name, file_path, file_size, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, original_name, file_size, mime_type, created_at`,
      [req.params.id, savedFilename, filename, filePath, buffer.length, mimeType || 'application/octet-stream', req.user.userId]
    );

    // Update project timestamp
    await db.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    // Add update log
    await db.query(
      'INSERT INTO project_updates (project_id, message, created_by) VALUES ($1, $2, $3)',
      [req.params.id, `File uploaded: ${filename}`, req.user.userId]
    );

    res.status(201).json(fileRecord);
  } catch (err) {
    next(err);
  }
};

// Download file
exports.downloadFile = async (req, res, next) => {
  try {
    const { rows: [file] } = await db.query(
      `SELECT pf.*, p.user_id FROM project_files pf
       JOIN projects p ON p.id = pf.project_id
       WHERE pf.id = $1`,
      [req.params.fileId]
    );
    if (!file) return res.status(404).json({ error: { message: 'File not found' } });

    // Check access
    const isOwner = req.user.userId === process.env.OWNER_USER_ID;
    if (!isOwner && file.user_id !== req.user.userId) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: { message: 'File not found on disk' } });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', file.file_size);

    const stream = fs.createReadStream(file.file_path);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

// Delete project (admin only)
exports.deleteProject = async (req, res, next) => {
  try {
    // Delete files from disk
    const { rows: files } = await db.query(
      'SELECT file_path FROM project_files WHERE project_id = $1',
      [req.params.id]
    );
    for (const f of files) {
      if (fs.existsSync(f.file_path)) fs.unlinkSync(f.file_path);
    }

    await db.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    next(err);
  }
};
