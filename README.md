# school76 — DeepSeek-Harness

Платформа совместной разработки образовательного кубсата формата 1U на базе архитектуры **DeepSeek-Harness (Cordis)**: всё является плагином с обратимыми эффектами, швами возможностей (Three-Role Seams), профилями композиции и агентским циклом.

## Архитектура и возможности

- **Ядро DeepSeek-Harness (Cordis)** — модульный контейнер плагинов (`src/harness/cordis.ts`, `server/harness/runtime.ts`, `harness.profile.yaml`):
  - **Профили композиции** — переключение конфигураций (`cubesat-full`, `firmware-lab`, `headless-ci`, `sdk-minimal`) с автоматическим монтированием и откатом плагинов.
  - **Швы возможностей (Seams)** — независимые контракты (`dsh-store`, `dsh-forge`, `dsh-s3`, `dsh-ci`, `dsh-realtime`, `dsh-tools`, `dsh-llm`) с подменяемыми провайдерами.
  - **Агентский цикл и dsh-tools** — выполнение типизированных инструментов и многошаговых инженерных сценариев по задачам, wiki, CI и ПО.
- **Управление задачами** — доска (Канбан), таблица, календарь и Гант по подсистемам (`OBC`, `EPS`, `ADCS`, `COMMS`, `PAYLOAD`, `GROUND`).
- **mBlock Борт ПО** — визуальный конструктор на базе `blockly` (`zelos` renderer), трансляция в MicroPython и STM32 C++, онлайн-стенд 1U.
- **Техчат команды** — тематические каналы подсистем через WebSocket со списком участников онлайн.
- **Проекты и база знаний** — 3D-макет 1U, Forgejo `llm-wiki` с `[[wikilinks]]`, редактор Univer, Garage S3 и CI/CD.

## Запуск

```bash
pnpm install
pnpm dev
```

Сервер запускается на `http://localhost:3000`. Для production-сборки:

```bash
pnpm build
pnpm start
```
