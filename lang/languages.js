/* The languages in the dropdown. country: the one country in the app that this language implies (Spanish has none, as it could be Spain or Mexico), offered when the language is chosen. To add one: add a line here and a pack file lang/<code>.js (or add it on the Localisation screen and download the pack). */
AVAI18n.addBuiltIn([
  { code: 'ja', name: '日本語', locale: 'ja-JP', country: 'JP' },
  { code: 'ko', name: '한국어', locale: 'ko-KR', country: 'KR' },
  { code: 'th', name: 'ไทย', locale: 'th-TH', country: 'TH' },
  { code: 'pt', name: 'Português', locale: 'pt-PT', country: 'PT' },
  { code: 'pt-br', name: 'Português (Brasil)', locale: 'pt-BR', country: 'BR' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'fr', name: 'Français', locale: 'fr-FR', country: 'FR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE', country: 'DE' },
  { code: 'it', name: 'Italiano', locale: 'it-IT', country: 'IT' },
  { code: 'zh-tw', name: '繁體中文', locale: 'zh-TW', country: 'TW' },
  { code: 'id', name: 'Bahasa Indonesia', locale: 'id-ID', country: 'ID' },
  { code: 'vi', name: 'Tiếng Việt', locale: 'vi-VN', country: 'VN' }
]);
