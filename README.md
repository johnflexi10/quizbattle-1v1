# 🎮 QuizBattle 1v1 — Duelo em Tempo Real

> Jogo de perguntas e respostas multiplayer 1v1 em tempo real com suporte multiplataforma (PC, Celular e Tablet).

---

## 🌟 Funcionalidades

- **⚔️ Modo 1v1 Multiplayer**: Crie salas privadas ou públicas e convide amigos com link de 1 clique pelo WhatsApp ou código de 4 dígitos.
- **🤖 Modo Treino vs Bot**: Jogue contra inteligência artificial ajustada em 3 níveis (Fácil, Médio e Difícil).
- **📱 Multi-Device & Mobile First**: Conecte facilmente pelo smartphone lendo o QR Code ou acessando via rede local / internet.
- **📚 800 Perguntas em 13 Categorias Temáticas**:
  - 🏠 Cotidiano & Casa
  - 🍳 Comida & Culinária
  - 🩺 Saúde & Bem-Estar
  - 📱 Tecnologia & Celular
  - 💡 Curiosidades & Costumes
  - 💳 Trabalho & Dinheiro
  - 🚗 Trânsito & Cidade
  - 🌍 Geografia
  - 🏛️ História
  - ✍️ Português
  - 🔢 Matemática
  - 🧩 O Que É, O Que É?
  - 🎭 Variados & Pop
- **🔥 Sistema de Combos**: Bônus de pontuação por velocidade e sequências de acertos consecutivos.
- **🏆 Efeitos & Estatísticas**: Chuva de confetes na vitória, sons temáticos (com opção mudo), botão de tela cheia e histórico de vitórias salvo no navegador.

---

## 🚀 Como Executar Localmente

1. **Instale as dependências:**
   `ash
   npm install
   `

2. **Inicie o servidor:**
   `ash
   npm start
   `

3. **Acesse no navegador:**
   - No computador: http://localhost:3000
   - No celular (mesmo Wi-Fi): http://SEU_IP_LOCAL:3000

---

## 🌐 Como Fazer Deploy na Nuvem (Acesso Mundial)

### Opção 1: Render.com (Grátis)
1. Conecte sua conta do GitHub no [Render.com](https://render.com).
2. Clique em **New Web Service** e selecione o repositório quizbattle-1v1.
3. Configure:
   - **Environment**: Node
   - **Build Command**: 
pm install
   - **Start Command**: 
ode server.js
4. Clique em **Create Web Service**. Pronto! Seu link público HTTPS estará ativo.

### Opção 2: Railway.app / Fly.io
1. Basta importar o repositório; as portas e scripts são detectados automaticamente pelo package.json.
