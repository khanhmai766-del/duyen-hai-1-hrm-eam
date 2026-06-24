import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const client = new Client({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'postgres',
  database: 'powerplant'
});

await client.connect();
console.log('Connected to local DB');

const res = await client.query('SELECT * FROM "User"');
fs.writeFileSync('users_export.json', JSON.stringify(res.rows, null, 2));
console.log('Exported ' + res.rows.length + ' users to users_export.json');

await client.end();