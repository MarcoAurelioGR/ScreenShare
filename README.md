# Screen Share — React + Node.js + LiveKit Cloud



Aplicativo de compartilhamento de tela em tempo real utilizando \*\*React\*\*, \*\*Node.js\*\*, \*\*WebSocket\*\*, \*\*WebRTC\*\* e \*\*LiveKit Cloud\*\*.



O frontend utiliza a biblioteca `livekit-client` para conexão com o LiveKit e compartilhamento de tela. O backend é responsável pelo gerenciamento das salas, participantes, permissões e geração dos tokens de acesso.



---



## Requisitos



* Node.js 20+

* npm

* Conta no \[LiveKit Cloud](https://cloud.livekit.io/)

* Roteador com possibilidade de configurar encaminhamento de portas para acesso externo



---



# 1. Configurar o LiveKit



Crie um projeto no LiveKit Cloud e obtenha:



* `LIVEKIT\\\\\\\_URL`

* `LIVEKIT\\\\\\\_API\\\\\\\_KEY`

* `LIVEKIT\\\\\\\_API\\\\\\\_SECRET`



No arquivo:



```text

backend/.env

```



configure:



```env

PORT=3000



LIVEKIT\\\\\\\_URL=wss://<seu-projeto>.livekit.cloud

LIVEKIT\\\\\\\_API\\\\\\\_KEY=sua\\\\\\\_api\\\\\\\_key

LIVEKIT\\\\\\\_API\\\\\\\_SECRET=sua\\\\\\\_api\\\\\\\_secret

```



O backend utiliza essas credenciais para gerar os tokens de acesso ao LiveKit. A `LIVEKIT\\\\\\\_API\\\\\\\_SECRET` permanece somente no backend.



---



# 2. Configurar o Frontend



No arquivo:



```text

frontend/.env

```



configure inicialmente:



```env

VITE\\\\\\\_API\\\\\\\_URL=http://localhost:3000

```



Essa variável define o endereço do backend utilizado pelo frontend.



---



# 3. Executar o Backend



Abra um terminal:



```bash

cd backend

npm install

npm run dev

```



O backend utiliza a porta `3000` por padrão e aceita conexões em todas as interfaces de rede.



---



# 4. Executar o Frontend



Abra outro terminal:



```bash

cd frontend

npm install

npm run dev

```



O frontend será disponibilizado pelo Vite, normalmente na porta:



```text

5173

```



Para permitir acesso de outros computadores da rede, configure o `vite.config.ts` para aceitar conexões externas:



```ts

export default defineConfig({

\\\&#x20; server: {

\\\&#x20;   host: '0.0.0.0',

\\\&#x20;   port: 5173

\\\&#x20; }

})

```



---



# 5. Acesso pela rede local



```text

http://localhost:5173

```



Como o frontend precisa acessar o backend, altere o arquivo:



```text

frontend/.env

```



para:



```env

VITE\\\\\\\_API\\\\\\\_URL=http://localhost:3000

```



Substitua `localhost` pelo IP local do computador que está executando o backend.



---



# 6. Acesso Seguro pela Internet (HTTPS via Cloudflare Tunnel) - Recomendado



Para evitar problemas de segurança com permissões de tela no navegador (que exigem HTTPS) e expor sua aplicação sem configurar o roteador, utilize o Cloudflare Tunnel.



Passo 1: Execute o comando para abrir uma rota segura para o backend:



npx cloudflared tunnel --url http://localhost:3000



Passo 2: Insira o LINK HTTPS gerado (ex: https://nome-aleatorio.trycloudflare.com) no .env do Frontend:



VITE\_API\_URL=https://SEU\_LINK\_HTTPS\_DO\_BACKEND



Passo 3: Execute o comando para abrir uma rota segura para o frontend:



npx cloudflared tunnel --url http://localhost:5173



Pronto! O sistema estará rodando no LINK HTTPS gerado para o Frontend. Acesse este link de qualquer dispositivo na internet e os recursos de compartilhamento de tela funcionarão nativamente, sem bloqueios.



# 7. Acesso pela Internet usando o IP público (Port Forwarding)



Para permitir que pessoas fora da sua rede acessem o aplicativo, é possível utilizar diretamente o \*\*IP público do roteador\*\*.

Primeiro, o computador que executa o projeto deve possuir um IP local fixo, por exemplo:



Descubra o IP local do computador:



ipconfig



Exemplo:



```text

192.168.1.100

```



Depois configure o \*\*Port Forwarding\*\* do roteador.



### Porta do Frontend



```text

TCP 5173 → 192.168.1.100:5173

```



### Porta do Backend



```text

TCP 3000 → 192.168.1.100:3000

```



Também pode ser necessário liberar essas portas no Firewall do Windows.



---



# 8. Configurar o endereço público do Backend (Se usar Port Forwarding)



Depois de configurar o encaminhamento de portas, o frontend precisa apontar para o endereço público do backend.



Por exemplo, se o IP público for:



```text

200.100.50.25

```



configure:



```env

VITE\\\\\\\_API\\\\\\\_URL=http://200.100.50.25:3000

```



Depois reinicie o frontend.



Os participantes poderão acessar:



```text

http://200.100.50.25:5173

```



O frontend então se comunicará com:



```text

http://200.100.50.25:3000

```



que será encaminhado pelo roteador para o computador que está executando o backend.



---



# 9. Por que o Chrome pode exigir o `chrome://flags/#unsafely-treat-insecure-origin-as-secure`?



O botão de compartilhamento utiliza o `livekit-client`, através de:



```typescript

setScreenShareEnabled()

```



Essa funcionalidade depende dos recursos de captura de tela disponibilizados pelo navegador.



Quando o aplicativo é acessado através de um endereço como:



```text

http://200.100.50.25:5173

```



a página está sendo carregada através de \*\*HTTP\*\*, e não de HTTPS.



Nessa situação, o navegador pode bloquear funcionalidades que exigem um \*\*contexto seguro\*\*, incluindo recursos utilizados para captura de tela.



Para testes com HTTP, o Chrome possui a configuração:



```text

chrome://flags/#unsafely-treat-insecure-origin-as-secure

```



Ative:



```text

Insecure origins treated as secure

```



e informe a origem que está sendo utilizada, por exemplo:



```text

http://200.100.50.25:5173

```



Depois reinicie o Chrome.



### Importante



Essa configuração é apenas uma alternativa para \*\*testes utilizando HTTP\*\*.





# 10. Resumo da configuração



## Local



```text

Frontend:

http://localhost:5173



Backend:

http://localhost:3000

```



Frontend:



```env

VITE\\\\\\\_API\\\\\\\_URL=http://localhost:3000

```



---



## Rede local



Exemplo:



```text

Frontend:

http://localhost:5173



Backend:

http://localhost:3000

```



Frontend:



```env

VITE\\\\\\\_API\\\\\\\_URL=http://localhost:3000

```



\---



## Internet (Cloudflare Tunnel - HTTPS Seguro)



Para gerar uma URL com protocolo HTTPS utilize o comando para o backend:



npx cloudflared tunnel --url http://localhost:3000





Cole o link gerado no .env do frontend:

VITE\_API\_URL=https://LINK\_HTTPS\_DO\_BACKEND

Para gerar uma URL com protocolo HTTPS utilize o comando para o frontend:



npx cloudflared tunnel --url http://localhost:5173



Acesse o aplicativo através do LINK HTTPS gerado para o Frontend.



## Internet (IP Público via HTTP)



Configure no roteador:



```text

TCP 5173 → IP\\\\\\\_LOCAL\\\\\\\_DO\\\\\\\_PC:5173

TCP 3000 → IP\\\\\\\_LOCAL\\\\\\\_DO\\\\\\\_PC:3000

```



Frontend:



```env

VITE\\\\\\\_API\\\\\\\_URL=http://SEU\\\\\\\_IP\\\\\\\_PUBLICO:3000

```



Acesso:



```text

http://SEU\\\\\\\_IP\\\\\\\_PUBLICO:5173

```



Para testes utilizando protocolo HTTP, o Chrome pode exigir:



```text

chrome://flags/#unsafely-treat-insecure-origin-as-secure

```

