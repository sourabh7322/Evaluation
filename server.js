import express from 'express';
import mongoose from 'mongoose';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import { config } from 'dotenv';
config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.DB_URL;
mongoose.connect(MONGO_URI).then(() => {
    log('info', 'MongoDB connected successfully.');
}).catch(err => {
    log('error', `MongoDB connection error: ${err}`);
});


const entrySchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    score: Number,
    age: Number,
    city: String,
    gender: String
}, { timestamps: true });

const Entry = mongoose.model('Entry', entrySchema);

function log(level, message) {
    const logMessage = `${new Date().toISOString()} [${level.toUpperCase()}] - ${message}\n`;
    fs.appendFileSync(path.join(__dirname, `logs/${level.toLowerCase()}.log`), logMessage);
    console.log(logMessage);
}
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

const app = express();

const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs/access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// DashBoard for the filter part
app.get('/', (req, res) => {
    const level = req.query.level ? req.query.level.toUpperCase() : 'INFO';
    const logFilePath = path.join(__dirname, `logs/${level.toLowerCase()}.log`);
    let filteredLogs = [];

    if (fs.existsSync(logFilePath)) {
        const logFile = fs.readFileSync(logFilePath, 'utf-8');
        filteredLogs = logFile.split('\n').filter(log => log.includes(level));
    }

    res.send(`
    <h1>Log Dashboard</h1>
    <form method="get" style="margin-bottom: 20px;">
      <label for="level">Log Level:</label>
      <select id="level" name="level" onchange="this.form.submit()">
        <option value="INFO" ${level === 'INFO' ? 'selected' : ''}>INFO</option>
        <option value="WARN" ${level === 'WARN' ? 'selected' : ''}>WARN</option>
        <option value="ERROR" ${level === 'ERROR' ? 'selected' : ''}>ERROR</option>
        <option value="SUCCESS" ${level === 'SUCCESS' ? 'selected' : ''}>SUCCESS</option>
      </select>
    </form>
    <pre>${filteredLogs.join('\n')}</pre>
  `);
});

// Function to process data in chunks
async function processChunks(dataArray, chunkSize) {
    for (let i = 0; i < dataArray.length; i += chunkSize) {
        const chunk = dataArray.slice(i, i + chunkSize);
        log('info', `Processing chunk: ${i / chunkSize + 1} / ${Math.ceil(dataArray.length / chunkSize)}`);

        const promises = chunk.map(async (data) => {
            try {
                const existingEntry = await Entry.findOne({ id: data.id });
                if (!existingEntry) {
                    await Entry.create(data);
                    log('success', `New entry added: ${JSON.stringify(data)}`);
                } else {
                    await Entry.updateOne({ id: data.id }, data);
                    log('success', `Existing entry updated: ${JSON.stringify(data)}`);
                }
            } catch (error) {
                log('error', `Error processing data: ${JSON.stringify(data)}, Error: ${error}`);
            }
        });

        await Promise.all(promises);
    }
}

// Updating data in the MongoDB server
async function readFileAndUpload() {
    const filePath = path.join(__dirname, "./MOCK_DATA.json");
    if (!fs.existsSync(filePath)) {
        log('error', `Data file not found: ${filePath}`);
        return;
    }

    let rawData;
    try {
        rawData = fs.readFileSync(filePath, 'utf-8');
        log('info', `Read data from file: ${filePath}`);
    } catch (error) {
        log('error', `Failed to read file: ${filePath}, Error: ${error}`);
        return;
    }

    let dataArray;
    try {
        dataArray = JSON.parse(rawData);
        log('info', `Parsed data successfully from file: ${filePath}`);
    } catch (error) {
        log('error', `Failed to parse data from file: ${filePath}, Error: ${error}`);
        return;
    }

    await processChunks(dataArray, 10);
}






cron.schedule('0 0,12 * * *', () => {
    log('info', 'Running scheduled task');
    readFileAndUpload().catch(err => log('error', `Error in scheduled task: ${err}`));
});

app.listen(PORT, () => {
    log('info', `Server is running on port ${PORT}`);
});