import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.config';

config({ quiet: true });

export default new DataSource(buildTypeOrmOptions((key) => process.env[key]));
