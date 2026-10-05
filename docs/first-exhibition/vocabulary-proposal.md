# Vocabulary proposal — First Exhibition (draft for Ben's verdict)

**Why:** the topic list grew from Ben's own interests and his designated blogs (the round-2 mine's top un-promoted tags are retro sci-fi, Soviet, the 1970s and the atomic age). Onboarding can only offer what the vocabulary has, so a reader whose taste sits elsewhere gets a feed built around Ben's. This proposes 168 new topics in 40 new groups, plus two new facets.

**How this differs from `docs/topic-proposals*.md`:** those are _mined_ from tags the corpus already carries, and `promote:topics` reads their `<!-- tag: -->` comments. These are _not_ mined — most have few or no items yet — so they can't go through `promote:topics`. A ticked line here becomes a hand-added topic with seed queries for the search-shaped sources (a cell per V1 source in `config/topics.ts`), and is filled by the next ingest. Walk sources will also start homing items under it via classify, because the classify prompt lists every topic.

**How to verdict:** tick `- [x]` to accept; edit the **bold label** freely; the seed is a first guess at the search query (one is enough to start; add per-source cells where a museum needs different words). Untick anything that a public-domain, museum-and-blog corpus can't fill honestly. Ids are slugs; keep them stable once promoted.

**New facets (needs a schema/type change, see DESIGN §7):** `tradition` — where and when a way of making comes from; replaces _Place_ as something onboarding asks about. `form` — kinds of writing, so articles can be matched by form as well as subject.

## Subject

### Animals (`animals-group`, existing group, extended · wing: Creatures)

_Already in Ambit: Animals, Zoology, Cats._

- [ ] `dogs` — **Dogs** <!-- facet: subject --> <!-- group: animals-group --> · seed: "dogs"
- [ ] `horses` — **Horses** <!-- facet: subject --> <!-- group: animals-group --> · seed: "horses"

### Insects (`insects-group`, existing group, extended · wing: Creatures)

_Already in Ambit: Insects._

- [ ] `butterflies-and-moths` — **Butterflies & moths** <!-- facet: subject --> <!-- group: insects-group --> · seed: "butterflies and moths"

### Sea life (`sea-life`, new group · wing: Creatures)

- [ ] `marine-life` — **Marine life** <!-- facet: subject --> <!-- group: sea-life --> · seed: "marine life"
- [ ] `shells` — **Shells** <!-- facet: subject --> <!-- group: sea-life --> · seed: "shells"
- [ ] `whales` — **Whales** <!-- facet: subject --> <!-- group: sea-life --> · seed: "whales"

### Plants (`plants-group`, existing group, extended · wing: Growing things)

_Already in Ambit: Plants, Botany, Flowers, Trees._

- [ ] `houseplants` — **Houseplants** <!-- facet: subject --> <!-- group: plants-group --> · seed: "houseplants"

### Gardens (`gardens`, new group · wing: Growing things)

- [x] `gardens` — **Gardens** <!-- facet: subject --> <!-- group: gardens --> · seed: "gardens"
- [ ] `garden-design` — **Garden design** <!-- facet: subject --> <!-- group: gardens --> · seed: "garden design"

### Farm & field (`farm-and-field`, new group · wing: Growing things)

- [ ] `farming` — **Farming** <!-- facet: subject --> <!-- group: farm-and-field --> · seed: "farming"
- [ ] `harvest` — **Harvest** <!-- facet: subject --> <!-- group: farm-and-field --> · seed: "harvest"
- [ ] `rural-life` — **Rural life** <!-- facet: subject --> <!-- group: farm-and-field --> · seed: "rural life"

### Rocks & earth (`rocks-and-earth`, existing group, extended · wing: Land, sea & sky)

_Already in Ambit: Geology._

- [ ] `minerals` — **Minerals** <!-- facet: subject --> <!-- group: rocks-and-earth --> · seed: "minerals"
- [ ] `volcanoes` — **Volcanoes** <!-- facet: subject --> <!-- group: rocks-and-earth --> · seed: "volcanoes"

### Mountains & ice (`mountains-and-ice`, new group · wing: Land, sea & sky)

- [x] `mountains` — **Mountains** <!-- facet: subject --> <!-- group: mountains-and-ice --> · seed: "mountains"
- [ ] `polar` — **Polar** <!-- facet: subject --> <!-- group: mountains-and-ice --> · seed: "polar"
- [ ] `glaciers` — **Glaciers** <!-- facet: subject --> <!-- group: mountains-and-ice --> · seed: "glaciers"

### Seasons (`seasons`, new group · wing: Land, sea & sky)

- [ ] `spring` — **Spring** <!-- facet: subject --> <!-- group: seasons --> · seed: "spring"
- [ ] `summer` — **Summer** <!-- facet: subject --> <!-- group: seasons --> · seed: "summer"
- [ ] `autumn` — **Autumn** <!-- facet: subject --> <!-- group: seasons --> · seed: "autumn"
- [ ] `winter` — **Winter** <!-- facet: subject --> <!-- group: seasons --> · seed: "winter"

### Imagined futures (`imagined-futures`, new group · wing: Space & tomorrow)

- [ ] `utopias` — **Utopias** <!-- facet: subject --> <!-- group: imagined-futures --> · seed: "utopias"
- [ ] `future-cities` — **Future cities** <!-- facet: subject --> <!-- group: imagined-futures --> · seed: "future cities"
- [ ] `space-age` — **Space age** <!-- facet: subject --> <!-- group: imagined-futures --> · seed: "space age"

### Trains, ships & flight (`trains-ships-and-flight`, new group · wing: Machines & how things work)

- [ ] `trains` — **Trains** <!-- facet: subject --> <!-- group: trains-ships-and-flight --> · seed: "trains"
- [x] `ships` — **Ships** <!-- facet: subject --> <!-- group: trains-ships-and-flight --> · seed: "ships"
- [ ] `aviation` — **Aviation** <!-- facet: subject --> <!-- group: trains-ships-and-flight --> · seed: "aviation"
- [ ] `bicycles` — **Bicycles** <!-- facet: subject --> <!-- group: trains-ships-and-flight --> · seed: "bicycles"

### Science & maths (`science-and-maths`, new group · wing: Machines & how things work)

- [ ] `mathematics` — **Mathematics** <!-- facet: subject --> <!-- group: science-and-maths --> · seed: "mathematics"
- [ ] `physics` — **Physics** <!-- facet: subject --> <!-- group: science-and-maths --> · seed: "physics"
- [ ] `chemistry` — **Chemistry** <!-- facet: subject --> <!-- group: science-and-maths --> · seed: "chemistry"
- [ ] `scientific-instruments` — **Scientific instruments** <!-- facet: subject --> <!-- group: science-and-maths --> · seed: "scientific instruments"
- [ ] `clocks` — **Clocks** <!-- facet: subject --> <!-- group: science-and-maths --> · seed: "clocks"

### Interiors & houses (`interiors-and-houses`, new group · wing: Cities & buildings)

- [x] `interiors` — **Interiors** <!-- facet: subject --> <!-- group: interiors-and-houses --> · seed: "interiors"
- [ ] `houses` — **Houses** <!-- facet: subject --> <!-- group: interiors-and-houses --> · seed: "houses"
- [ ] `cabins` — **Cabins** <!-- facet: subject --> <!-- group: interiors-and-houses --> · seed: "cabins"

### Bridges & towers (`bridges-and-towers`, new group · wing: Cities & buildings)

- [ ] `bridges` — **Bridges** <!-- facet: subject --> <!-- group: bridges-and-towers --> · seed: "bridges"
- [ ] `towers` — **Towers** <!-- facet: subject --> <!-- group: bridges-and-towers --> · seed: "towers"

### Castles & ruins (`castles-and-ruins`, new group · wing: Cities & buildings)

- [ ] `castles` — **Castles** <!-- facet: subject --> <!-- group: castles-and-ruins --> · seed: "castles"
- [x] `ruins` — **Ruins** <!-- facet: subject --> <!-- group: castles-and-ruins --> · seed: "ruins"

### Work & trades (`work-and-trades`, new group · wing: People & daily life)

- [ ] `work` — **Work** <!-- facet: subject --> <!-- group: work-and-trades --> · seed: "work"
- [ ] `craftspeople` — **Craftspeople** <!-- facet: subject --> <!-- group: work-and-trades --> · seed: "craftspeople"
- [ ] `markets` — **Markets** <!-- facet: subject --> <!-- group: work-and-trades --> · seed: "markets"

### Sport & play (`sport-and-play`, new group · wing: People & daily life)

- [x] `sport` — **Sport** <!-- facet: subject --> <!-- group: sport-and-play --> · seed: "sport"
- [ ] `athletics` — **Athletics** <!-- facet: subject --> <!-- group: sport-and-play --> · seed: "athletics"
- [ ] `winter-sports` — **Winter sports** <!-- facet: subject --> <!-- group: sport-and-play --> · seed: "winter sports"
- [ ] `board-games` — **Board games** <!-- facet: subject --> <!-- group: sport-and-play --> · seed: "board games"

### Celebrations (`celebrations`, new group · wing: People & daily life)

- [x] `festivals` — **Festivals** <!-- facet: subject --> <!-- group: celebrations --> · seed: "festivals"
- [ ] `weddings` — **Weddings** <!-- facet: subject --> <!-- group: celebrations --> · seed: "weddings"
- [ ] `holidays` — **Holidays** <!-- facet: subject --> <!-- group: celebrations --> · seed: "holidays"

### Fashion & dress (`fashion-group`, existing group, extended · wing: People & daily life)

_Already in Ambit: Fashion, Shoes, Jewelry._

- [x] `costume` — **Costume** <!-- facet: subject --> <!-- group: fashion-group --> · seed: "costume"
- [ ] `hairstyles` — **Hairstyles** <!-- facet: subject --> <!-- group: fashion-group --> · seed: "hairstyles"
- [ ] `beauty` — **Beauty** <!-- facet: subject --> <!-- group: fashion-group --> · seed: "beauty"

### History & society (`history-and-society`, new group · wing: People & daily life)

- [ ] `social-history` — **Social history** <!-- facet: subject --> <!-- group: history-and-society --> · seed: "social history"
- [ ] `royalty` — **Royalty** <!-- facet: subject --> <!-- group: history-and-society --> · seed: "royalty"
- [ ] `military-history` — **Military history** <!-- facet: subject --> <!-- group: history-and-society --> · seed: "military history"
- [ ] `crime` — **Crime** <!-- facet: subject --> <!-- group: history-and-society --> · seed: "crime"

### Folklore & fairy tales (`folklore-and-fairy-tales`, new group · wing: Myth, ritual & the ancient world)

- [x] `folklore` — **Folklore** <!-- facet: subject --> <!-- group: folklore-and-fairy-tales --> · seed: "folklore"
- [ ] `fairy-tales` — **Fairy tales** <!-- facet: subject --> <!-- group: folklore-and-fairy-tales --> · seed: "fairy tales"
- [x] `masks` — **Masks** <!-- facet: subject --> <!-- group: folklore-and-fairy-tales --> · seed: "masks"
- [ ] `witches` — **Witches** <!-- facet: subject --> <!-- group: folklore-and-fairy-tales --> · seed: "witches"

### The ancient world (`ancient-world`, existing group, extended · wing: Myth, ritual & the ancient world)

_Already in Ambit: Ancient history._

- [ ] `ancient-egypt` — **Ancient Egypt** <!-- facet: subject --> <!-- group: ancient-world --> · seed: "ancient egypt"
- [ ] `classical-antiquity` — **Classical antiquity** <!-- facet: subject --> <!-- group: ancient-world --> · seed: "classical antiquity"
- [ ] `pre-columbian` — **Pre-Columbian** <!-- facet: subject --> <!-- group: ancient-world --> · seed: "pre-columbian"
- [ ] `ancient-china` — **Ancient China** <!-- facet: subject --> <!-- group: ancient-world --> · seed: "ancient china"

### Faith & ritual (`faith-and-ritual`, new group · wing: Myth, ritual & the ancient world)

- [x] `religious-art` — **Religious art** <!-- facet: subject --> <!-- group: faith-and-ritual --> · seed: "religious art"
- [x] `sacred-architecture` — **Sacred architecture** <!-- facet: subject --> <!-- group: faith-and-ritual --> · seed: "sacred architecture"
- [ ] `ritual` — **Ritual** <!-- facet: subject --> <!-- group: faith-and-ritual --> · seed: "ritual"
- [ ] `icons` — **Icons** <!-- facet: subject --> <!-- group: faith-and-ritual --> · seed: "icons"

### Mind & feeling (`mind-and-feeling`, existing group, extended · wing: Body & mind)

_Already in Ambit: Consciousness, Emotions._

- [ ] `dreams` — **Dreams** <!-- facet: subject --> <!-- group: mind-and-feeling --> · seed: "dreams"
- [ ] `psychology` — **Psychology** <!-- facet: subject --> <!-- group: mind-and-feeling --> · seed: "psychology"
- [ ] `neuroscience` — **Neuroscience** <!-- facet: subject --> <!-- group: mind-and-feeling --> · seed: "neuroscience"

### Love & family (`love-and-family`, new group · wing: Body & mind)

- [ ] `love` — **Love** <!-- facet: subject --> <!-- group: love-and-family --> · seed: "love"
- [ ] `family` — **Family** <!-- facet: subject --> <!-- group: love-and-family --> · seed: "family"

### Home & objects (`home-and-objects`, existing group, extended · wing: Things people make)

_Already in Ambit: Furniture, Mirrors, Still life._

- [ ] `collecting` — **Collecting** <!-- facet: subject --> <!-- group: home-and-objects --> · seed: "collecting"

### Food & drink (`food-group`, existing group, extended · wing: Food & the everyday)

_Already in Ambit: Food, Fruit._

- [ ] `cooking` — **Cooking** <!-- facet: subject --> <!-- group: food-group --> · seed: "cooking"
- [ ] `drinks` — **Drinks** <!-- facet: subject --> <!-- group: food-group --> · seed: "drinks"
- [ ] `cafes-and-restaurants` — **Cafés & restaurants** <!-- facet: subject --> <!-- group: food-group --> · seed: "cafés and restaurants"

### Shops & signs (`shops-and-signs`, new group · wing: Food & the everyday)

- [ ] `shops` — **Shops** <!-- facet: subject --> <!-- group: shops-and-signs --> · seed: "shops"
- [ ] `signs` — **Signs** <!-- facet: subject --> <!-- group: shops-and-signs --> · seed: "signs"
- [ ] `packaging` — **Packaging** <!-- facet: subject --> <!-- group: shops-and-signs --> · seed: "packaging"

### Books & words (`books-and-words`, existing group, extended · wing: Food & the everyday)

_Already in Ambit: Books, Literature._

- [ ] `manuscripts` — **Manuscripts** <!-- facet: subject --> <!-- group: books-and-words --> · seed: "manuscripts"
- [ ] `handwriting` — **Handwriting** <!-- facet: subject --> <!-- group: books-and-words --> · seed: "handwriting"

### Humor (`humor-group`, existing group, extended · wing: Food & the everyday)

_Already in Ambit: Humor._

- [ ] `caricature` — **Caricature** <!-- facet: subject --> <!-- group: humor-group --> · seed: "caricature"

### Music, sound & dance (`music-sound-and-dance`, existing group, extended · wing: Stage, screen & sound)

_Already in Ambit: Music, Sound, Dance._

- [x] `musical-instruments` — **Musical instruments** <!-- facet: subject --> <!-- group: music-sound-and-dance --> · seed: "musical instruments"

### Film, TV & animation (`film-and-animation`, existing group, extended · wing: Stage, screen & sound)

_Already in Ambit: Film, Animation._

- [ ] `television` — **Television** <!-- facet: subject --> <!-- group: film-and-animation --> · seed: "television"

### Theatre & circus (`theatre-and-circus`, new group · wing: Stage, screen & sound)

- [x] `theatre` — **Theatre** <!-- facet: subject --> <!-- group: theatre-and-circus --> · seed: "theatre"
- [ ] `circus` — **Circus** <!-- facet: subject --> <!-- group: theatre-and-circus --> · seed: "circus"
- [ ] `puppetry` — **Puppetry** <!-- facet: subject --> <!-- group: theatre-and-circus --> · seed: "puppetry"
- [ ] `magic-shows` — **Magic shows** <!-- facet: subject --> <!-- group: theatre-and-circus --> · seed: "magic shows"

## Medium

### Printmaking (`printmaking`, existing group, extended)

_Already in Ambit: Engraving._

- [x] `woodcut` — **Woodcut** <!-- facet: medium --> <!-- group: printmaking --> · seed: "woodcut"
- [x] `etching` — **Etching** <!-- facet: medium --> <!-- group: printmaking --> · seed: "etching"
- [ ] `lithography` — **Lithography** <!-- facet: medium --> <!-- group: printmaking --> · seed: "lithography"
- [ ] `screen-printing` — **Screen printing** <!-- facet: medium --> <!-- group: printmaking --> · seed: "screen printing"

### Photography (`photography-group`, existing group, extended)

_Already in Ambit: Photography, Street photography._

- [ ] `documentary-photography` — **Documentary photography** <!-- facet: medium --> <!-- group: photography-group --> · seed: "documentary photography"
- [ ] `portrait-photography` — **Portrait photography** <!-- facet: medium --> <!-- group: photography-group --> · seed: "portrait photography"
- [x] `nature-photography` — **Nature photography** <!-- facet: medium --> <!-- group: photography-group --> · seed: "nature photography"
- [ ] `fashion-photography` — **Fashion photography** <!-- facet: medium --> <!-- group: photography-group --> · seed: "fashion photography"
- [ ] `vernacular-photography` — **Snapshots & found photos** <!-- facet: medium --> <!-- group: photography-group --> · seed: "snapshots and found photos"

### Sculpture (`sculpture-group`, existing group, extended)

_Already in Ambit: Sculpture, Carving._

- [ ] `monuments` — **Monuments** <!-- facet: medium --> <!-- group: sculpture-group --> · seed: "monuments"

### Ceramics & glass (`ceramics-and-glass`, existing group, extended)

_Already in Ambit: Ceramics, Clay, Glass._

- [x] `stained-glass` — **Stained glass** <!-- facet: medium --> <!-- group: ceramics-and-glass --> · seed: "stained glass"
- [ ] `porcelain` — **Porcelain** <!-- facet: medium --> <!-- group: ceramics-and-glass --> · seed: "porcelain"

### Textiles (`textiles-group`, existing group, extended)

_Already in Ambit: Textiles, Embroidery._

- [ ] `quilts` — **Quilts** <!-- facet: medium --> <!-- group: textiles-group --> · seed: "quilts"
- [ ] `rugs-and-carpets` — **Rugs & carpets** <!-- facet: medium --> <!-- group: textiles-group --> · seed: "rugs and carpets"
- [x] `tapestry` — **Tapestry** <!-- facet: medium --> <!-- group: textiles-group --> · seed: "tapestry"
- [ ] `weaving` — **Weaving** <!-- facet: medium --> <!-- group: textiles-group --> · seed: "weaving"

### Decorative arts (`decorative-arts`, new group)

- [ ] `mosaics` — **Mosaics** <!-- facet: medium --> <!-- group: decorative-arts --> · seed: "mosaics"
- [ ] `lacquer` — **Lacquer** <!-- facet: medium --> <!-- group: decorative-arts --> · seed: "lacquer"
- [ ] `silverwork` — **Silverwork** <!-- facet: medium --> <!-- group: decorative-arts --> · seed: "silverwork"
- [ ] `enamel` — **Enamel** <!-- facet: medium --> <!-- group: decorative-arts --> · seed: "enamel"

### Calligraphy & manuscripts (`calligraphy-and-manuscripts`, new group)

- [ ] `calligraphy` — **Calligraphy** <!-- facet: medium --> <!-- group: calligraphy-and-manuscripts --> · seed: "calligraphy"
- [x] `illuminated-manuscripts` — **Illuminated manuscripts** <!-- facet: medium --> <!-- group: calligraphy-and-manuscripts --> · seed: "illuminated manuscripts"

## Tradition (new facet)

### World traditions (`world-traditions`, existing group, extended)

_Already in Ambit: Folk art._

- [x] `ukiyo-e` — **Ukiyo-e** <!-- facet: tradition --> <!-- group: world-traditions --> · seed: "ukiyo-e"
- [ ] `chinese-ink-painting` — **Chinese ink painting** <!-- facet: tradition --> <!-- group: world-traditions --> · seed: "chinese ink painting"
- [x] `islamic-art` — **Islamic art** <!-- facet: tradition --> <!-- group: world-traditions --> · seed: "islamic art"
- [ ] `persian-and-mughal-painting` — **Persian & Mughal painting** <!-- facet: tradition --> <!-- group: world-traditions --> · seed: "persian and mughal painting"
- [ ] `african-art` — **African art** <!-- facet: tradition --> <!-- group: world-traditions --> · seed: "african art"
- [ ] `indigenous-art` — **Indigenous art** <!-- facet: tradition --> <!-- group: world-traditions --> · seed: "indigenous art"

### Old masters (`old-masters`, new group)

- [x] `medieval` — **Medieval** <!-- facet: tradition --> <!-- group: old-masters --> · seed: "medieval"
- [x] `renaissance` — **Renaissance** <!-- facet: tradition --> <!-- group: old-masters --> · seed: "renaissance"
- [ ] `baroque` — **Baroque** <!-- facet: tradition --> <!-- group: old-masters --> · seed: "baroque"
- [ ] `dutch-golden-age` — **Dutch Golden Age** <!-- facet: tradition --> <!-- group: old-masters --> · seed: "dutch golden age"

### The nineteenth century (`nineteenth-century`, new group)

- [ ] `romanticism` — **Romanticism** <!-- facet: tradition --> <!-- group: nineteenth-century --> · seed: "romanticism"
- [x] `impressionism` — **Impressionism** <!-- facet: tradition --> <!-- group: nineteenth-century --> · seed: "impressionism"
- [ ] `art-nouveau` — **Art nouveau** <!-- facet: tradition --> <!-- group: nineteenth-century --> · seed: "art nouveau"
- [ ] `arts-and-crafts` — **Arts & Crafts** <!-- facet: tradition --> <!-- group: nineteenth-century --> · seed: "arts and crafts"

### Modern movements (`modern-movements`, new group)

- [ ] `constructivism` — **Constructivism** <!-- facet: tradition --> <!-- group: modern-movements --> · seed: "constructivism"
- [ ] `bauhaus` — **Bauhaus** <!-- facet: tradition --> <!-- group: modern-movements --> · seed: "bauhaus"
- [ ] `expressionism` — **Expressionism** <!-- facet: tradition --> <!-- group: modern-movements --> · seed: "expressionism"
- [ ] `pop-art` — **Pop art** <!-- facet: tradition --> <!-- group: modern-movements --> · seed: "pop art"

### Outsider & naive art (`outsider-and-naive`, new group)

- [ ] `outsider-art` — **Outsider art** <!-- facet: tradition --> <!-- group: outsider-and-naive --> · seed: "outsider art"
- [ ] `naive-art` — **Naive art** <!-- facet: tradition --> <!-- group: outsider-and-naive --> · seed: "naive art"

## Look

### Cozy & homely (`cozy-and-homely`, new group)

- [x] `cozy` — **Cozy** <!-- facet: look --> <!-- group: cozy-and-homely --> · seed: "cozy"
- [ ] `rustic` — **Rustic** <!-- facet: look --> <!-- group: cozy-and-homely --> · seed: "rustic"
- [x] `nostalgic` — **Nostalgic** <!-- facet: look --> <!-- group: cozy-and-homely --> · seed: "nostalgic"

### Romantic & pastoral (`romantic-and-pastoral`, new group)

- [ ] `romantic` — **Romantic** <!-- facet: look --> <!-- group: romantic-and-pastoral --> · seed: "romantic"
- [ ] `pastoral` — **Pastoral** <!-- facet: look --> <!-- group: romantic-and-pastoral --> · seed: "pastoral"

### Ornate & opulent (`ornate-and-opulent`, new group)

- [x] `ornate` — **Ornate** <!-- facet: look --> <!-- group: ornate-and-opulent --> · seed: "ornate"
- [ ] `glamour` — **Glamour** <!-- facet: look --> <!-- group: ornate-and-opulent --> · seed: "glamour"

### Minimal & quiet (`minimal-and-quiet`, new group)

- [x] `minimal` — **Minimal** <!-- facet: look --> <!-- group: minimal-and-quiet --> · seed: "minimal"
- [ ] `serene` — **Serene** <!-- facet: look --> <!-- group: minimal-and-quiet --> · seed: "serene"

### Cute & kitsch (`cute-and-kitsch`, new group)

- [ ] `cute` — **Cute** <!-- facet: look --> <!-- group: cute-and-kitsch --> · seed: "cute"
- [ ] `kitsch` — **Kitsch** <!-- facet: look --> <!-- group: cute-and-kitsch --> · seed: "kitsch"

### Gothic (`gothic-group`, new group)

- [ ] `gothic` — **Gothic** <!-- facet: look --> <!-- group: gothic-group --> · seed: "gothic"

### Joyful (`joyful`, new group)

- [ ] `joyful` — **Joyful** <!-- facet: look --> <!-- group: joyful --> · seed: "joyful"
- [ ] `festive` — **Festive** <!-- facet: look --> <!-- group: joyful --> · seed: "festive"

### Grand (`grand`, new group)

- [ ] `monumental` — **Monumental** <!-- facet: look --> <!-- group: grand --> · seed: "monumental"
- [ ] `epic` — **Epic** <!-- facet: look --> <!-- group: grand --> · seed: "epic"

### Delicate & intricate (`delicate-and-intricate`, new group)

- [x] `delicate` — **Delicate** <!-- facet: look --> <!-- group: delicate-and-intricate --> · seed: "delicate"
- [ ] `intricate` — **Intricate** <!-- facet: look --> <!-- group: delicate-and-intricate --> · seed: "intricate"

## Form (new facet — writing)

### Essays & ideas (`essays-and-ideas`, new group)

- [x] `essays` — **Essays** <!-- facet: form --> <!-- group: essays-and-ideas --> · seed: "essays"
- [ ] `philosophy` — **Philosophy** <!-- facet: form --> <!-- group: essays-and-ideas --> · seed: "philosophy"
- [x] `criticism` — **Criticism** <!-- facet: form --> <!-- group: essays-and-ideas --> · seed: "criticism"

### Life writing (`life-writing`, new group)

- [ ] `memoir` — **Memoir** <!-- facet: form --> <!-- group: life-writing --> · seed: "memoir"
- [x] `letters-and-diaries` — **Letters & diaries** <!-- facet: form --> <!-- group: life-writing --> · seed: "letters and diaries"
- [ ] `biography` — **Biography** <!-- facet: form --> <!-- group: life-writing --> · seed: "biography"

### The world described (`the-world-described`, new group)

- [ ] `travel-writing` — **Travel writing** <!-- facet: form --> <!-- group: the-world-described --> · seed: "travel writing"
- [ ] `nature-writing` — **Nature writing** <!-- facet: form --> <!-- group: the-world-described --> · seed: "nature writing"
- [ ] `food-writing` — **Food writing** <!-- facet: form --> <!-- group: the-world-described --> · seed: "food writing"

### Science & history writing (`knowledge-writing`, new group)

- [ ] `science-writing` — **Science writing** <!-- facet: form --> <!-- group: knowledge-writing --> · seed: "science writing"
- [ ] `history-writing` — **History writing** <!-- facet: form --> <!-- group: knowledge-writing --> · seed: "history writing"

### Stories (`stories`, new group)

- [ ] `adventure-stories` — **Adventure stories** <!-- facet: form --> <!-- group: stories --> · seed: "adventure stories"
- [ ] `mystery-fiction` — **Mystery fiction** <!-- facet: form --> <!-- group: stories --> · seed: "mystery fiction"
- [ ] `gothic-fiction` — **Gothic fiction** <!-- facet: form --> <!-- group: stories --> · seed: "gothic fiction"
- [ ] `sci-fi-stories` — **Science fiction stories** <!-- facet: form --> <!-- group: stories --> · seed: "science fiction stories"
- [ ] `romance-fiction` — **Romance** <!-- facet: form --> <!-- group: stories --> · seed: "romance"
- [ ] `childrens-books` — **Children's books** <!-- facet: form --> <!-- group: stories --> · seed: "children's books"
- [ ] `humor-writing` — **Comic writing** <!-- facet: form --> <!-- group: stories --> · seed: "comic writing"
