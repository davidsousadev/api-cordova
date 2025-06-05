const { exec } = require('child_process');
require('dotenv').config();
const path = require('path');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('❌ DATABASE_URL não encontrada no .env');
    process.exit(1);
}

const sqlFile = path.join(__dirname, 'db', 'create_tables.sql');
const comando = `psql "${databaseUrl}" -f "${sqlFile}"`;

console.log('🚀 Executando comando:', comando);

exec(comando, (error, stdout, stderr) => {
    if (error) {
        console.error(`❌ Erro ao criar tabelas: ${error.message}`);
        console.error(stderr);
        process.exit(1);
    }
    if (stderr) {
        console.error(`⚠️ Aviso: ${stderr}`);
    }
    console.log('✅ Tabelas criadas com sucesso!');
    console.log(stdout);
});
