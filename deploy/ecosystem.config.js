// Plantilla para desplegar el backend con PM2 en un VPS/servidor propio, sin
// Docker (alternativa a deploy/docker-compose.prod.yml — usa una u otra, no
// ambas). Uso: `pm2 start deploy/ecosystem.config.js --env production`
// desde la raíz del repo, con backend/.env ya completado (ver README §4.2).
module.exports = {
  apps: [
    {
      name: 'ditash-backend',
      cwd: './backend',
      script: 'src/server.js',
      instances: 'max',       // cluster mode: un worker por núcleo de CPU
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
      },
      // Reinicia si el proceso usa más de 500MB (protección básica ante
      // fugas de memoria) o si crashea, pero no en bucle infinito.
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '30s',
      // Logs a archivo en vez de solo stdout (útil junto a `pm2 logs` y a
      // logrotate — instala `pm2 install pm2-logrotate` para rotarlos).
      error_file: '../logs/backend-error.log',
      out_file: '../logs/backend-out.log',
      time: true,
    },
  ],
};
