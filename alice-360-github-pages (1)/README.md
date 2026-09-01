# Alice 360 — Diagnóstico CEFR

Aplicação responsiva para avaliação de inglês de uma aluna de 11 anos durante uma aula online. Mede compreensão oral, leitura, recursos linguísticos, escrita, fala, interação e mediação. O resultado é um parecer descritivo, sem nota numérica.

## Publicar gratuitamente no GitHub Pages

1. Crie um repositório público chamado `alice-360` na sua conta do GitHub.
2. Envie o conteúdo desta pasta para o repositório.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment → Source**, escolha **GitHub Actions**.
5. A publicação acontece automaticamente e o link aparecerá na página **Actions**.

O endereço terá o formato `https://SEU-USUARIO.github.io/alice-360/`.

## Executar no computador

```bash
npm install
npm run dev
```

Esta edição usa síntese e reconhecimento de voz do navegador e mantém o progresso no próprio dispositivo.

## Privacidade

O projeto do GitHub Pages é totalmente estático: não usa banco de dados, não contém chave de API e não envia áudio ou respostas para um servidor próprio. O áudio permanece temporariamente na página durante a aplicação e o progresso textual fica no armazenamento local do dispositivo.

## Validação

```bash
npm run lint
npm run build
```
