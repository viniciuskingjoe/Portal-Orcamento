# Planejamento Orçamentário

Sistema web de planejamento orçamentário em React, com dados mockados e estado
mantido exclusivamente em memória.

## Executar

Requer Node.js 18 ou superior.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite no terminal.

## Gerar versão de produção

```bash
npm run build
npm run preview
```

O componente principal está em `src/App.jsx`. A camada de dados mockados fica no
início desse arquivo e contém comentários indicando os pontos preparados para
substituição por consultas à API/banco de dados.
