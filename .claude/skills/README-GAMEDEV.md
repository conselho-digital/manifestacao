# Skills de desenvolvimento de jogos (awesome-gamedev-agent-skills)

Origem: https://github.com/gamedev-skills/awesome-gamedev-agent-skills (Apache-2.0; licença e aviso copiados aqui: `LICENSE-awesome-gamedev-agent-skills`, `NOTICE-awesome-gamedev-agent-skills`).
Instaladas só as que servem ao nosso jogo (Vite + TypeScript + three.js, multiplayer, PC e celular):

- `router`: lê o pedido e diz quais skills abrir (nosso motor = three.js).
- `threejs-scene-setup`, `threejs-gltf-loading`, `threejs-materials-lighting`: base do three.js (r187, o mesmo da `package.json`).
- `performance-optimization`: método de medir antes de otimizar (orçamento de quadro, chamadas de desenho, alocações).
- `camera-systems`, `input-systems`, `game-ui-ux`, `game-feel`, `audio-design`, `physics-tuning`, `fps-shooter`.

Para revisar o jogo com elas: abrir o `router`, depois a skill do assunto e conferir o código pela seção "Gotchas" de cada uma.
As outras skills do repositório (Godot, Unity, Unreal, Roblox etc.) não foram copiadas porque o jogo não usa esses motores.
