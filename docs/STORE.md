# Публикация «Уроки» в App Store и Google Play

Статус: ✅ сделано в коде · 🟡 сделать владельцу в кабинете магазина · ⚠️ решение/риск

## Apple App Store

| Правило | Что требуется | Статус |
|---|---|---|
| 3.1.1 Встроенные покупки | Цифровая подписка — только через In-App Purchase | ✅ RevenueCat → StoreKit |
| 3.1.2 Автопродляемые подписки | На экране оплаты: цена, период, пробный период, автопродление, как отменить, ссылки на соглашение и политику | ✅ `src/components/Paywall.tsx` |
| 3.1.1 Восстановление покупок | Кнопка «Восстановить покупки» | ✅ |
| 5.1.1(v) Удаление аккаунта | Удаление учётной записи и данных внутри приложения | ✅ Настройки → «Удалить семью и все данные» |
| 5.1.1 Политика конфиденциальности | Ссылка в приложении и в App Store Connect | ✅ `/legal/privacy` · 🟡 вставить URL в App Store Connect |
| 5.1.2 Privacy labels | Анкета «App Privacy» | 🟡 Фото (контент), Имя, Идентификатор пользователя, История покупок — для функциональности, без трекинга |
| Privacy manifest | `PrivacyInfo.xcprivacy` с причинами API | ✅ `app.json → ios.privacyManifests` |
| 2.1 Демо-доступ | Рецензенту нужен способ войти | 🟡 создать семью, выдать ей бесплатный доступ, передать код приглашения в «Notes for Review» |
| 1.3 Kids Category | В детской категории — запрет внешних ссылок без parental gate и стороннего трекинга | ⚠️ Рекомендация: категория «Образование», **не** Kids Category (приложение для родителей; покупка — только у родителя) |
| Разрешения | Понятные тексты камеры и уведомлений | ✅ камера на 3 языках в Info.plist (через app.json), микрофон/Face ID не запрашиваются |
| iPad | Приложение поддерживает iPad → нужны скриншоты iPad | ✅ адаптивная вёрстка · 🟡 скриншоты 13" |
| Экспортный контроль | `ITSAppUsesNonExemptEncryption = false` | ✅ |

## Google Play

| Правило | Что требуется | Статус |
|---|---|---|
| Play Billing | Подписка через Google Play Billing | ✅ RevenueCat |
| Удаление аккаунта | В приложении **и** веб-страница без приложения | ✅ в приложении · ✅ `/legal/delete` · 🟡 указать URL в Play Console |
| Data safety | Анкета безопасности данных | 🟡 те же данные, что в Apple; шифрование при передаче — да; удаление по запросу — да |
| Политика конфиденциальности | URL в Play Console | ✅ `/legal/privacy` |
| Целевая аудитория / Families | Если среди аудитории дети до 13 — соблюдать Families Policy | ⚠️ Указать аудиторию «родители 18+»; без рекламы, без геолокации, данные ребёнка только с согласия родителя (есть в онбординге) |
| SCHEDULE_EXACT_ALARM | Декларация в Play Console | 🟡 Обоснование: «напоминания к сроку домашнего задания должны приходить точно в выбранное родителем время» |
| Формат | AAB, подписанный upload-ключом | ✅ CI собирает `Uroki.aab`, когда заданы секреты ключа |
| Target API | Актуальный targetSdk | ✅ Expo SDK 57 |

## Что нужно от владельца

1. **Аккаунты:** Apple Developer ($99/год), Google Play Console ($25 один раз).
2. **RevenueCat** (бесплатно до $2 500 выручки/мес): проект, продукты `uroki_monthly` (2990 ₸, 7 дней бесплатно), entitlement `pro`, offering `default` с пакетом Monthly.
   - Webhook → `https://cmranrfjvvmhktntbnpg.supabase.co/functions/v1/app/billing/revenuecat`, заголовок Authorization — случайная строка (сохраняется в `app_secrets.app_rc_webhook_auth`).
   - Secret API key → `app_secrets.app_rc_api_key`.
   - Публичные SDK-ключи → секреты GitHub `RC_IOS_KEY`, `RC_ANDROID_KEY`.
   - Включить оплату: `app_secrets.app_billing_enabled = '1'`.
3. **Ключ подписи Android** → секреты `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. **Push:** аккаунт Expo (бесплатно) → `EAS_PROJECT_ID`; Firebase → `GOOGLE_SERVICES_JSON`; ключ APNs загрузить в Expo.
5. **Автовыкладка сервера:** `SUPABASE_ACCESS_TOKEN` в секретах репозитория.
6. **Реквизиты оператора** (ИП/ТОО, БИН, e-mail поддержки) — вписать в `supabase/functions/app/legal.ts`.
7. **Бесплатный доступ** (только владелец): `POST /admin/grant` с заголовком `x-admin-key` (`app_secrets.app_admin_key`), тело `{"code":"<код семьи>"}` — навсегда, `{"code":"…","days":30}` — на срок, `{"code":"…","revoke":true}` — отозвать.
