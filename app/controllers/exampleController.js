const db = require("../models");
const WebSocket = require('ws');
const { Pool } = require('pg');
const axios = require('axios');
const redis = require('redis');
// const Model = db.Model;
// const { Op } = require("sequelize");

// Jawaban saya + komparasi dengan GPT
exports.refactoreMe1 = async (req, res) => {
  try {
    // Mengambil data dari tabel surveys menggunakan query SQL native
    const [results] = await db.sequelize.query('SELECT "values" FROM "surveys"');

    const indices = [];
    for (let i = 0; i < 10; i++) {
      indices.push([]);
    }

    results.forEach(row => {
      const values = row.values;
      for (let index = 0; index < values.length; index++) {
        const value = values[index];
        indices[index].push(value);
      }
    });

    // Menghitung rata-rata nilai untuk setiap index
    const totalIndices = indices.map(index => {
      const sum = index.reduce((acc, val) => acc + val, 0);
      return sum / index.length;
    });

    res.status(200).send({
      statusCode: 200,
      success: true,
      data: totalIndices,
    });
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      success: false,
      message: 'tidak dapat di proses!',
    });
  }
};

// Jawaban saya + komparasi dengan GPT

exports.refactoreMe2 = async (req, res) => {
  const { userId, values, id } = req.body;

  try {
    // Melakukan INSERT ke tabel surveys
    await db.sequelize.query(
      `INSERT INTO public.surveys ("userId", "values", "createdAt", "updatedAt") VALUES (:userId, :values, NOW(), NOW())`,
      {
        replacements: { userId, values: JSON.stringify(values) },
        type: db.Sequelize.QueryTypes.INSERT
      }
    );

    await db.sequelize.query(
      `UPDATE public.users SET "dosurvey" = TRUE WHERE id = :id`,
      {
        replacements: { id },
        type: db.Sequelize.QueryTypes.UPDATE
      }
    );

    res.status(201).send({
      statusCode: 201,
      message: "Survey sent successfully!",
      success: true
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      statusCode: 500,
      message: "Cannot post survey.",
      success: false
    });
  }
};


let wsClients = []; 
const fetchAttackData = async () => {
  try {
    const response = await axios.get('https://livethreatmap.radware.com/api/map/attacks?limit=10');
    return response.data;
  } catch (error) {
    console.error('Error fetching data from API:', error);
    return null;
  }
};
const broadcastData = (data) => {
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

exports.callmeWebSocket = (req, res) => {
  const server = req.app.get('server');
  const wss = new WebSocket.Server({ server });

  // When a new client connects
  wss.on('connection', (ws) => {
    console.log('New client connected');
    wsClients.push(ws);

    // Clean up disconnected clients
    ws.on('close', () => {
      wsClients = wsClients.filter(client => client !== ws);
      console.log('Client disconnected');
    });
  });

  setInterval(async () => {
    const data = await fetchAttackData();
    if (data) {
      broadcastData(data);
    }
  }, 180000);
};

// Create a new pool for PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Make sure this is set in your .env
});

// Redis client setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URL, // Make sure this is set in your .env
});

redisClient.connect();

exports.getData = async (req, res) => {
  try {
    // Check if data is cached in Redis
    const cachedData = await redisClient.get('attacksData');
    if (cachedData) {
      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: JSON.parse(cachedData),
      });
    }

    const { data: attackData } = await axios.get('https://livethreatmap.radware.com/api/map/attacks?limit=10');

    // Insert data into the database
    const insertQuery = `
      INSERT INTO attacks (sourceCountry, destinationCountry, attackType)
      VALUES ($1, $2, $3)
    `;
    
    for (const attack of attackData) {
      await pool.query(insertQuery, [
        attack.sourceCountry,
        attack.destinationCountry,
        attack.attackType,
      ]);
    }

    // Fetch the total count of attacks by sourceCountry and destinationCountry
    const query = `
      SELECT destinationCountry AS label, COUNT(*) AS total
      FROM attacks
      GROUP BY destinationCountry
    `;
    const result = await pool.query(query);

    const labels = result.rows.map(row => row.label);
    const totals = result.rows.map(row => parseInt(row.total));

    const responseData = {
      label: labels,
      total: totals,
    };


    await redisClient.set('attacksData', JSON.stringify(responseData), {
      EX: 3600,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: responseData,
    });

  } catch (error) {
    console.error('Error fetching data:', error);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: 'Internal Server Error',
    });
  }
};
