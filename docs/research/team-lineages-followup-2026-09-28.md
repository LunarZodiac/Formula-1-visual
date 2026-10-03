# Проверка преемственности команд: Mercedes и Alpine

Дата проверки: 2026-09-28

Область: только две цепочки из задания. Идентификаторы и допустимые типы связей сверены с проектом; девять подтверждённых переходов внесены в `data/editorial/team-lineages.json` и зеркально опубликованы в каталоге команд

## Редакционный вывод

Современная команда Mercedes в Брэкли может быть показана цепочкой `tyrrell` → `bar` → `honda` → `brawn` → `mercedes`, но первый переход требует оговорки: BAR приобрела заявку Tyrrell, однако Formula 1 прямо характеризует BAR 1999 года как фактически новую команду. Поэтому это не простое переименование

Современная Alpine в Энстоуне может быть показана цепочкой `toleman` → `benetton` → `renault` → `lotus_f1` → `renault` → `alpine`. Переход Renault → Lotus был многоступенчатым: контроль над командой перешёл к Genii раньше, чем официальное имя конструктора сменилось в 2012 году. Обратный переход начался сделкой 18 декабря 2015 года и вступил в спортивную хронологию с сезона 2016

Названия Lotus нельзя объединять. `lotus_f1` — команда из Энстоуна 2012–2015 годов; это не историческая `team_lotus` и не `lotus_racing` 2010–2011 годов, впоследствии ставшая Caterham

## Подтверждённые связи

| Действие и эффективный сезон | predecessorId → successorId | Тип связи для реестра | Подтверждение и нюанс спортивной идентичности | Источник | Уверенность | Пригодность |
| --- | --- | --- | --- | --- | --- | --- |
| Покупка в 1998; новая заявка с сезона 1999 | `tyrrell` → `bar` | `licence_transfer` | British American Racing приобрела Tyrrell. При этом F1 отдельно уточняет, что BAR технически получила заявку Tyrrell, но практически была новой командой; это сильнее разрывает спортивную идентичность, чем обычная смена владельца | Formula 1, «The family tree of Formula 1's 11 teams and how they came to be», 2026-03-01, https://www.formula1.com/en/latest/article/the-family-tree-f1-11-teams-and-how-they-came-to-be.2QBA1PPMf0bC8mp2xxqZeq; Formula 1, «How did F1’s most recent new teams approach their first driver line-ups?», https://www.formula1.com/en/latest/article/from-world-champions-to-grand-prix-rookies-how-did-f1s-most-recent-new-teams.25tfjMrYGd3SBCGp3ypm8q; доступ 2026-09-28 | Высокая | Да, с этой оговоркой |
| Соглашение 4 октября 2005, выкуп оставшихся акций до конца 2005; заводская команда с сезона 2006 | `bar` → `honda` | `factory_takeover` | Honda, уже владевшая 45%, договорилась купить оставшиеся 55% BARH Ltd.; база осталась в Брэкли. Это полноценный заводской выкуп и смена идентичности с нового сезона | Honda Global, «Honda acquires all shares in BARH Ltd.», 2005-10-04, https://global.honda/en/newsroom/news/2005/c051004-eng.html; доступ 2026-09-28 | Высокая | Да |
| Продажа объявлена 6 марта 2009; участие с сезона 2009 | `honda` → `brawn` | `ownership_change` | Honda продала Россу Брауну 100% акций холдинга команды; новая команда заявилась как Brawn GP. Это management buyout, а не простое переименование | Honda Global, «Honda Announces Sale of the Honda Racing F1 Team», 2009-03-06, https://global.honda/en/newsroom/news/2009/c090306eng.html; доступ 2026-09-28 | Высокая | Да; в описании назвать management buyout |
| Контроль получен в конце 2009; заводская команда с сезона 2010 | `brawn` → `mercedes` | `factory_takeover` | Daimler получила контроль над чемпионом Brawn GP в конце 2009 года, а Mercedes вернулась как заводская команда в 2010-м. Официальный источник команды подтверждает преемственность, но не приводит в этой публикации точную календарную дату сделки | Mercedes-AMG Petronas F1 Team, «Mercedes' 300th GP: Our Journey to Three Centuries of F1 Starts», https://www.mercedesamgf1.com/news/mercedes-300th-gp-our-journey-to-three-centuries-of-f1-starts; Formula 1, «Mercedes — Year by Year», https://www.formula1.com/en/information/mercedes-year-by-year.45gq1OShE3U1H5iEJSVtNd; доступ 2026-09-28 | Высокая для сезона, средняя для точной даты сделки | Да, с `validFromYear: 2010` |
| Покупка в 1985; имя Benetton с сезона 1986 | `toleman` → `benetton` | `ownership_change` | Benetton купила Toleman в 1985 году и выставила собственный конструктор в 1986-м | Formula 1, «From Nike to Benetton: Iconic fashion partnerships that shaped Formula 1», 2025-09-12, https://www.formula1.com/en/latest/article/from-nike-to-benetton-iconic-fashion-partnerships-that-shaped-formula-1.6dpBXobLVpXXQ2sMw1ZD9y; доступ 2026-09-28 | Высокая | Да, `validFromYear: 1986` |
| Renault взяла управление в 2000; полное переименование с сезона 2002 | `benetton` → `renault` | `factory_takeover` | Renault приобрела и начала контролировать операцию раньше смены имени; Benetton продолжала выступать в 2000–2001 годах, Renault F1 Team появилась в 2002-м | Formula 1, «TEAM GUIDE: Get briefed on Alpine as they push to join F1’s front-runners in 2023», https://www.formula1.com/en/latest/article/team-guide-get-briefed-on-alpine-as-they-push-to-join-f1s-front-runners-in.1xuTndqXy5gN6UsKuCBlvz; доступ 2026-09-28 | Высокая | Да, `validFromYear: 2002`; год 2000 оставить в описании сделки |
| Продажа большинства в 2009, 100% контроля Genii в конце 2010, Lotus Renault GP в 2011; официальное имя Lotus с сезона 2012 | `renault` → `lotus_f1` | `rename` | Для границы каталогов корректен 2012 год: F1 указывает, что официальное имя команды сменилось с Renault на Lotus. Владение уже перешло к Genii, поэтому `rename` описывает спортивную границу, но не всю корпоративную историю | Formula 1, «Lotus and Renault confirm partnership extension», https://www.formula1.com/en/latest/article/lotus-and-renault-confirm-partnership-extension.4XhDbnGUPd1EOVX0cssXgZ; Formula 1, «Alpine — Year by Year», https://www.formula1.com/en/information/alpine-year-by-year.26lcAj4zKxSs1w959B6yV; доступ 2026-09-28 | Высокая | Да, только с `validFromYear: 2012` и пояснением этапов 2009–2011 |
| Контрольная доля приобретена 18 декабря 2015; заводская команда с сезона 2016 | `lotus_f1` → `renault` | `factory_takeover` | Groupe Renault приобрела контрольную долю Lotus F1 Team Limited у структуры Genii. Это новая заводская фаза той же энстоунской операции, а не возвращение независимой команды Renault 1977–1985 годов | Renault Group, «Groupe Renault completes the acquisition of Lotus F1 Team», 2015-12-21, https://media.renaultgroup.com/groupe-renault-completes-the-acquisition-of-lotus-f1-team/?lang=eng; доступ 2026-09-28 | Высокая | Да, `validFromYear: 2016` |
| Объявлено в 2020; новое имя с сезона 2021 | `renault` → `alpine` | `rename` | Renault прямо объявила ребрендинг существующей команды в Alpine F1 Team. Шасси получило имя Alpine, двигатель сохранил имя Renault | Formula 1, «Renault to rebrand as Alpine F1 Team in 2021», https://www.formula1.com/en/latest/article/renault-alpine-f1-team-2021.7eY84dCU9MythQjcYG8T45; доступ 2026-09-28 | Высокая | Да, `validFromYear: 2021` |

## Ограничения идентификаторов каталога

| ID | Что нельзя смешивать | Следствие для хронологии |
| --- | --- | --- |
| `honda` | Заводскую Honda 1964–1968 и команду из Брэкли 2006–2008 | В этой цепочке участвует только сегмент 2006–2008 |
| `mercedes` | Заводскую Mercedes 1954–1955 и команду из Брэкли с 2010 года | Ребро от `brawn` относится только к сегменту с 2010 года |
| `renault` | Первую заводскую Renault 1977–1985 и энстоунские фазы 2002–2011 и 2016–2020 | Рёбра от `benetton`, `lotus_f1` и к `alpine` относятся только к Энстоуну; единый ID образует возвратную петлю через `lotus_f1` |
| `lotus_f1` | Энстоун 2012–2015, историческую `team_lotus` и `lotus_racing` 2010–2011 | В цепочку Alpine допустим только `lotus_f1` |

## Оставшиеся оговорки

- Для `tyrrell` → `bar` использован поддерживаемый тип `licence_transfer`: замена на `ownership_change` потеряла бы важное различие между приобретённой заявкой и фактически новой командой BAR
- Для `honda` → `brawn` в текущем наборе типов нет отдельного `management_buyout`; безопасный вариант — `ownership_change` с явным пояснением
- Для `renault` → `lotus_f1` одно поле `validFromYear` не способно одновременно передать продажу большинства в 2009 году, полный выход Renault из капитала в конце 2010-го, имя Lotus Renault GP в 2011-м и официальное имя Lotus с 2012-го. Для сезонной хронологии пригоден 2012 год; корпоративные даты должны оставаться в примечании
- Официальные источники в этой выборке подтверждают, что Daimler получила контроль над Brawn GP в конце 2009 года, но не дают точной календарной даты закрытия сделки. До добавления точного дня из первичного пресс-релиза достаточно уровня года и эффективного сезона 2010
- Повторный идентификатор `renault` остаётся ограничением каталога, однако модель хронологии привязывает рёбра к отдельным периодам участия и не образует цикл между эпохами 2002–2011 и 2016–2020

## Рекомендация по внесению

Обе цепочки опубликованы для сезонной хронологии с `validFromYear`: 1999, 2006, 2009, 2010 и 1986, 2002, 2012, 2016, 2021 соответственно. Типы связей и поведение модели при повторном ID `renault` проверены узкими тестами и прямой проверкой разрешённых периодов
