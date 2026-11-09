The project uses vanilla HTML, CSS and JavaScript.
No Node.js, npm, frameworks or build tools.

### File Responsibilities

- index.html: HTML structure only.
- script.js: Main application logic and rendering.
- script-production.js: Production chord data.

### Rules

- Use BEM naming methodology.
- Keep all JavaScript outside HTML.
- Do not duplicate application logic.
- Both modes must use the same rendering logic.
- Do not put demo data inside script.js.
- Do not put rendering logic inside demo or production files.
- Keep the project simple. Do not create additional files without a clear reason.

### Синтаксис файла с аккордами

Общая структура:
```
# Название песни

Куплет
>> 
   Припев 
>>

Куплет 2
>> 
   Припев 2
>>

// припев 2 раза
```

Аккорды находятся над буквами

```
     Am  Dm    E  Am   C G 
Строка  текста   песни
```

Am находится над "а", Dm над "е", E над пробелом, С и G просто в конце

Бывают просто аккорды и просто текст

```
Am | Dm | E

Это просто текст

```