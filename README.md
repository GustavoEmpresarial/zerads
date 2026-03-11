# ZerAds callback local com Node.js

Este projeto sobe um endpoint simples em Node.js para validar como o callback da ZerAds chega no seu servidor.

## Rodar localmente

```powershell
node server.js
```

No modo local, o exemplo usa `Qwerty12` como senha padrão se `CALLBACK_PASSWORD` não estiver definida.

Em produção, defina a variável de ambiente com uma senha própria.

## Rodar com Docker

```powershell
docker compose up -d --build
```

## URLs

- Status: `http://IP:3001/`
- Callback alternativo: `http://IP:3001/zerads`
- Callback no formato original: `http://IP:3001/zeradsptc.php`

## Teste manual

```powershell
curl "http://localhost:3001/zerads?pwd=Qwerty12&user=test&amount=0.01&clicks=1"
```

## Ver logs

O arquivo de log fica em `storage/logs/callback.log`.

Cada requisição salva:

- IP recebido
- usuário
- amount
- clicks
- se passou ou falhou na validação
- query completa recebida

## Configuração

Variáveis usadas pela aplicação:

- `PORT`: porta HTTP da aplicação
- `CALLBACK_PASSWORD`: senha esperada no parâmetro `pwd`
- `ALLOWED_IPS`: lista de IPs permitidos, separados por vírgula. Se vazio, aceita qualquer IP.
- `LOG_FILE`: caminho do arquivo de log

## Como isso ajuda

Se a ZerAds chamar seu endpoint, você vai conseguir verificar:

- se a URL foi atingida
- quais parâmetros chegaram
- se o IP veio como esperado
- se a senha bateu

Depois disso, você pode trocar a resposta em JSON pela lógica real de crédito no seu site.