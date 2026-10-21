UPDATE users
SET preferences = json_set(preferences, '$.colorTheme', 'tuesday')
WHERE json_extract(preferences, '$.colorTheme') = 'monday';
