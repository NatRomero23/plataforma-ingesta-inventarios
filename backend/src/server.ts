import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { logger } from './lib/logger.js';

const config = loadConfig();
const app = createApp();

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'Servidor de la plataforma escuchando');
});
