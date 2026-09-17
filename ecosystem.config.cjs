module.exports = {
  apps: [{
    name: "candle-crank",
    cwd: __dirname,
    script: "node_modules/tsx/dist/cli.mjs",
    args: "scripts/crank.ts --all",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    restart_delay: 10000,
    max_restarts: 20,
    env: { DOTENV_CONFIG_PATH: ".env.crank" },
  }],
};
