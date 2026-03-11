const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { URL } = require('node:url');

const port = Number(process.env.PORT || 3000);
const callbackPassword = String(process.env.CALLBACK_PASSWORD || 'Qwerty12');
const zeradsRef = String(process.env.ZERADS_REF || '10776').trim();

function randomUser() {
  const adjectives = ['fast', 'wild', 'cool', 'dark', 'iron', 'bold', 'neon', 'blue', 'red', 'gold'];
  const nouns = ['wolf', 'hawk', 'fox', 'bear', 'lion', 'crow', 'tiger', 'shark', 'eagle', 'viper'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}_${noun}_${num}`;
}
const allowedIps = String(process.env.ALLOWED_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);
const logFile = String(process.env.LOG_FILE || path.join(__dirname, 'storage', 'logs', 'callback.log'));

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

function ensureLogDirectory(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function appendLog(entry) {
  ensureLogDirectory(logFile);
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

function getFirstParam(searchParams, keys) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function mergeParams(primaryParams, secondaryParams) {
  const merged = new URLSearchParams(primaryParams);
  for (const [key, value] of secondaryParams.entries()) {
    if (!merged.has(key)) {
      merged.set(key, value);
    }
  }
  return merged;
}

function readRequestParams(request) {
  return new Promise((resolve) => {
    if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'PATCH') {
      resolve(new URLSearchParams());
      return;
    }

    let rawBody = '';
    request.on('data', (chunk) => {
      rawBody += chunk.toString('utf8');
    });

    request.on('end', () => {
      if (!rawBody.trim()) {
        resolve(new URLSearchParams());
        return;
      }

      const contentType = String(request.headers['content-type'] || '').toLowerCase();

      if (contentType.includes('application/x-www-form-urlencoded')) {
        resolve(new URLSearchParams(rawBody));
        return;
      }

      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(rawBody);
          const bodyParams = new URLSearchParams();
          if (parsed && typeof parsed === 'object') {
            for (const [key, value] of Object.entries(parsed)) {
              if (value !== undefined && value !== null) {
                bodyParams.set(key, String(value));
              }
            }
          }
          resolve(bodyParams);
          return;
        } catch {
          resolve(new URLSearchParams());
          return;
        }
      }

      resolve(new URLSearchParams(rawBody));
    });

    request.on('error', () => {
      resolve(new URLSearchParams());
    });
  });
}

function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim() !== '') {
    return forwardedFor.split(',')[0].trim();
  }

  const remoteAddress = request.socket.remoteAddress || '';
  if (remoteAddress.startsWith('::ffff:')) {
    return remoteAddress.slice(7);
  }

  return remoteAddress || 'unknown';
}

function validateCallback(searchParams, clientIp) {
  const pwd = getFirstParam(searchParams, ['pwd', 'password', 'pass', 'key']);
  const user = getFirstParam(searchParams, ['user', 'username', 'uid', 'userid', 'login']);
  const amountRaw = getFirstParam(searchParams, ['amount', 'value', 'reward', 'credit']) || null;
  const clicksRaw = getFirstParam(searchParams, ['clicks', 'click', 'views']) || null;
  const amount = amountRaw === null ? null : Number(amountRaw);
  const clicks = clicksRaw === null ? null : Number.parseInt(clicksRaw, 10);
  const errors = [];

  if (!callbackPassword) {
    errors.push('CALLBACK_PASSWORD nao configurado.');
  }

  if (!pwd || pwd !== callbackPassword) {
    errors.push('Senha invalida.');
  }

  if (!user) {
    errors.push('Parametro user ausente.');
  }

  if (amountRaw === null || Number.isNaN(amount)) {
    errors.push('Parametro amount ausente ou invalido.');
  }

  if (clicksRaw !== null && Number.isNaN(clicks)) {
    errors.push('Parametro clicks invalido.');
  }

  if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
    errors.push('IP nao autorizado.');
  }

  return {
    pwd,
    user,
    amount,
    clicks,
    errors,
  };
}

const server = http.createServer((request, response) => {
  (async () => {
  const baseUrl = `http://${request.headers.host || `localhost:${port}`}`;
  const currentUrl = new URL(request.url || '/', baseUrl);
  const pathname = currentUrl.pathname;

  if (pathname === '/status') {
    return sendJson(response, 200, {
      service: 'zerads-callback',
      status: 'online',
      endpoints: [
        'GET  /zerads          → redireciona para zerads.com/ptc.php com user aleatorio',
        'GET  /zeradsptc.php   → valida callback da ZerAds (query string)',
        'POST /zeradsptc.php   → valida callback da ZerAds (form/json)',
      ],
    });
  }

  if (pathname === '/' || pathname === '' || pathname === '/zerads' || pathname === '/zerads/') {
    const userForPtc = (currentUrl.searchParams.get('user') || '').trim() || randomUser();
    const refForPtc = (currentUrl.searchParams.get('ref') || zeradsRef || '10776').trim() || '10776';
    const redirectTarget = `https://zerads.com/ptc.php?ref=${encodeURIComponent(refForPtc)}&user=${encodeURIComponent(userForPtc)}`;
    response.writeHead(302, { Location: redirectTarget });
    response.end();
    return;
  }

  if (pathname !== '/zeradsptc.php') {
    return sendJson(response, 404, {
      error: 'not_found',
      path: pathname,
    });
  }

  const bodyParams = await readRequestParams(request);
  const allParams = mergeParams(currentUrl.searchParams, bodyParams);

  // Acesso manual no navegador sem parâmetros: responde com instrução em vez de rejeição.
  if (allParams.toString() === '') {
    return sendJson(response, 200, {
      service: 'zerads-callback',
      status: 'online',
      message: 'Envie os parametros de callback via query string ou POST.',
      accepted_params: {
        pwd: ['pwd', 'password', 'pass', 'key'],
        user: ['user', 'username', 'uid', 'userid', 'login'],
        amount: ['amount', 'value', 'reward', 'credit'],
        clicks: ['clicks', 'click', 'views'],
      },
    });
  }

  const clientIp = getClientIp(request);
  const validation = validateCallback(allParams, clientIp);

  const logEntry = {
    timestamp: new Date().toISOString(),
    path: request.url || '',
    ip: clientIp,
    user: validation.user,
    amount: validation.amount,
    clicks: validation.clicks,
    valid: validation.errors.length === 0,
    errors: validation.errors,
    query: Object.fromEntries(allParams.entries()),
  };

  appendLog(logEntry);

  if (validation.errors.length > 0) {
    return sendJson(response, 403, {
      ok: false,
      message: 'Callback rejeitado.',
      errors: validation.errors,
      received: {
        ip: clientIp,
        user: validation.user,
        amount: validation.amount,
        clicks: validation.clicks,
      },
    });
  }

  return sendJson(response, 200, {
    ok: true,
    message: 'Callback recebido com sucesso.',
    received: {
      ip: clientIp,
      user: validation.user,
      amount: validation.amount,
      clicks: validation.clicks,
    },
  });
  })().catch((error) => {
    return sendJson(response, 500, {
      ok: false,
      message: 'Erro interno ao processar callback.',
      error: String(error && error.message ? error.message : error),
    });
  });
});

server.listen(port, () => {
  console.log(`zerads-callback ouvindo na porta ${port}`);
});