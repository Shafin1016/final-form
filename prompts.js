/* Final Form — prompt bank.
   7 difficulty levels (1 = easiest). Each daily game picks one prompt per level, so the run ramps from easy to hard.
   Answer lines:  TIER  Display name | alias | alias ...
   Tier = how rare the answer is:  S Mythic · A Legendary · B Epic · C Rare · D Uncommon · E Common.
   Aliases are matched after lower-casing and stripping spaces/punctuation, and small typos are forgiven. */
window.FF_PROMPTS = [

/* ───────────── LEVEL 1 · warm-up ───────────── */
{ id: 'op-strawhats', lvl: 1, cat: 'Anime', src: 'One Piece', q: 'Name a member of the Straw Hat Pirates', a: `
E Monkey D. Luffy | luffy | monkey d luffy | monkey luffy | straw hat luffy
E Roronoa Zoro | zoro | zorro | roronoa zorro | zolo
D Sanji | vinsmoke sanji | black leg sanji
D Nami | cat burglar nami
C Usopp | usop | sogeking | god usopp
C Tony Tony Chopper | chopper | tony chopper
B Nico Robin | robin
B Franky | cutty flam
A Brook | soul king brook | soul king
S Jinbe | jimbei | jinbei | jimbe | knight of the sea` },

{ id: 'pkmn-151', lvl: 1, cat: 'Video games', src: 'Pokémon', q: 'Name one of the original 151 Pokémon', a: `
E Pikachu
E Charizard
D Bulbasaur
D Charmander
D Squirtle
D Mewtwo | mew two
D Mew
D Eevee
D Gengar
D Snorlax
D Jigglypuff
D Psyduck
D Meowth
D Gyarados
D Magikarp
D Dragonite
C Blastoise
C Venusaur
C Lapras
C Ditto
C Vaporeon
C Jolteon
C Flareon
C Onix
C Machamp
C Alakazam
C Geodude
C Zapdos
C Articuno
C Moltres
C Raichu
C Butterfree
C Pidgey
C Rattata
C Caterpie
C Vulpix
C Ninetales
C Growlithe
C Arcanine
C Abra
C Slowpoke
C Cubone
C Scyther
C Mr. Mime | mr mime | mister mime
C Gastly
C Haunter
C Clefairy
C Chansey
C Diglett
C Zubat
C Magnemite
C Voltorb
C Koffing
C Ekans
C Arbok
C Aerodactyl
C Dratini
C Ivysaur
C Charmeleon
C Wartortle
C Hitmonlee
C Hitmonchan
C Porygon
B Pidgeot
B Pidgeotto
B Metapod
B Weedle
B Kakuna
B Beedrill
B Raticate
B Spearow
B Fearow
B Sandshrew
B Sandslash
B Nidoking
B Nidoqueen
B Clefable
B Wigglytuff
B Golbat
B Oddish
B Dugtrio
B Persian
B Golduck
B Mankey
B Primeape
B Poliwag
B Poliwhirl
B Poliwrath
B Kadabra
B Machop
B Machoke
B Bellsprout
B Tentacool
B Tentacruel
B Graveler
B Golem
B Ponyta
B Rapidash
B Slowbro
B Magneton
B Farfetch'd | farfetchd | farfetched
B Grimer
B Muk
B Shellder
B Cloyster
B Drowzee
B Hypno
B Krabby
B Electrode
B Exeggutor
B Marowak
B Lickitung
B Weezing
B Rhyhorn
B Rhydon
B Kangaskhan
B Horsea
B Staryu
B Starmie
B Jynx
B Electabuzz
B Magmar
B Pinsir
B Tauros
B Omanyte
B Kabuto
B Dragonair
A Nidoran♀ | nidoran | nidoran f | nidoran female
A Nidoran♂ | nidoran m | nidoran male
A Nidorina
A Nidorino
A Gloom
A Vileplume
A Paras
A Parasect
A Venonat
A Venomoth
A Weepinbell
A Victreebel | victreebell | victribel
A Doduo
A Dodrio
A Seel
A Dewgong
A Exeggcute
A Kingler
A Seadra
A Goldeen
A Omastar
A Kabutops
S Tangela
S Seaking` },

{ id: 'nar-hokage', lvl: 1, cat: 'Anime', src: 'Naruto', q: 'Name a Hokage of the Hidden Leaf Village', a: `
E Naruto Uzumaki | naruto | uzumaki naruto | seventh hokage | 7th hokage | nanadaime
D Kakashi Hatake | kakashi | hatake kakashi | sixth hokage | 6th hokage | rokudaime
D Minato Namikaze | minato | namikaze minato | fourth hokage | 4th hokage | yondaime | yellow flash
C Tsunade | tsunade senju | lady tsunade | fifth hokage | 5th hokage | godaime
C Hashirama Senju | hashirama | senju hashirama | first hokage | 1st hokage | shodai | shodaime
B Hiruzen Sarutobi | hiruzen | sarutobi | sarutobi hiruzen | third hokage | 3rd hokage | sandaime | the third
A Tobirama Senju | tobirama | senju tobirama | second hokage | 2nd hokage | nidaime
S Shikamaru Nara | shikamaru | nara shikamaru | eighth hokage | 8th hokage` },

/* ───────────── LEVEL 2 ───────────── */
{ id: 'smash-ult', lvl: 2, cat: 'Video games', src: 'Super Smash Bros. Ultimate', q: 'Name a fighter in Super Smash Bros. Ultimate', a: `
E Mario
E Pikachu
E Link
E Kirby
D Fox | fox mccloud
D Sonic | sonic the hedgehog
D Donkey Kong | dk
D Samus | samus aran
D Luigi
D Yoshi
D Bowser
D Peach | princess peach
D Captain Falcon | falcon
D Pac-Man | pacman | pac man
D Cloud | cloud strife
D Ness
D Ganondorf | ganon
D Steve | alex | minecraft steve | enderman | zombie
D Sephiroth
D Sora
D Joker
D Jigglypuff
D Snake | solid snake
D Mewtwo
C Zelda | princess zelda
C Marth
C Falco | falco lombardi
C Meta Knight | metaknight
C King Dedede | dedede
C Wario
C Diddy Kong | diddy
C Ike
C Lucario
C Greninja
C Mega Man | megaman
C Bayonetta
C Inkling | inklings
C Ryu
C Ken | ken masters
C Roy
C Pit
C Lucina
C Young Link
C Toon Link
C Sheik
C Dr. Mario | doctor mario | dr mario
C Ridley
C Villager
C Isabelle
C Kazuya | kazuya mishima
C Terry | terry bogard
C Banjo & Kazooie | banjo | kazooie | banjo and kazooie
C Hero | dragon quest hero | dq hero | luminary | erdrick | solo | eight
C Charizard
C Squirtle
C Ivysaur
C Pokémon Trainer | pokemon trainer
C Shulk
C Daisy | princess daisy
C Zero Suit Samus | zss | zero suit
B Lucas
B Olimar | captain olimar | alph
B R.O.B. | rob | robot
B Wolf | wolf o'donnell | wolf odonnell
B Little Mac
B Rosalina & Luma | rosalina | rosalina and luma
B Palutena
B Robin
B Corrin
B Simon | simon belmont
B King K. Rool | king k rool | k rool | krool
B Incineroar
B Bowser Jr. | bowser jr | bowser junior | koopalings
B Ice Climbers | popo | nana
B Pichu
B Byleth
B Min Min | minmin
B Pyra & Mythra | pyra | mythra | pyra and mythra | aegis
B Wii Fit Trainer | wii fit
B Mr. Game & Watch | game and watch | mr game and watch | game & watch
B Duck Hunt | duck hunt duo | duck hunt dog
B Piranha Plant | petey
A Dark Pit
A Chrom
A Richter | richter belmont
A Dark Samus
A Mii Brawler
A Mii Swordfighter | mii sword fighter
S Mii Gunner` },

{ id: 'ds-hashira', lvl: 2, cat: 'Anime', src: 'Demon Slayer', q: 'Name a Hashira from Demon Slayer (current or former)', a: `
E Kyojuro Rengoku | rengoku | kyojuro | kyojurou | flame hashira
E Giyu Tomioka | giyu | giyuu | tomioka | water hashira
D Shinobu Kocho | shinobu | kocho | kochou | insect hashira
D Tengen Uzui | tengen | uzui | sound hashira
C Mitsuri Kanroji | mitsuri | kanroji | love hashira
C Muichiro Tokito | muichiro | muichirou | tokito | mist hashira
B Sanemi Shinazugawa | sanemi | shinazugawa | wind hashira
B Obanai Iguro | obanai | iguro | serpent hashira | snake hashira
A Gyomei Himejima | gyomei | gyoumei | himejima | stone hashira
S Kanae Kocho | kanae | flower hashira
S Shinjuro Rengoku | shinjuro | shinjurou` },

{ id: 'zelda-games', lvl: 2, cat: 'Video games', src: 'The Legend of Zelda', q: 'Name a game in The Legend of Zelda series', a: `
E Breath of the Wild | botw | zelda breath of the wild
E Ocarina of Time | oot | ocarina
D Tears of the Kingdom | totk
D Majora's Mask | majoras mask | majora | mm
D The Wind Waker | wind waker | windwaker | wind waker hd | ww
C Twilight Princess | twilight princess hd | tp
C A Link to the Past | link to the past | alttp | lttp
C Skyward Sword | skyward sword hd | ss
C Link's Awakening | links awakening | la
B The Legend of Zelda (1986) | the legend of zelda | legend of zelda | zelda 1 | the original zelda
B Zelda II: The Adventure of Link | zelda 2 | zelda ii | adventure of link | the adventure of link
B The Minish Cap | minish cap
B Phantom Hourglass
B A Link Between Worlds | link between worlds | albw
B Echoes of Wisdom
A Spirit Tracks
A Oracle of Seasons
A Oracle of Ages
A Hyrule Warriors | hyrule warriors age of calamity | age of calamity
A Four Swords Adventures
S Four Swords
S Tri Force Heroes | triforce heroes
S Cadence of Hyrule
S Link's Crossbow Training | links crossbow training
S Link: The Faces of Evil | faces of evil | zelda the wand of gamelon | wand of gamelon | zeldas adventure | zelda's adventure` },

/* ───────────── LEVEL 3 ───────────── */
{ id: 'akatsuki', lvl: 3, cat: 'Anime', src: 'Naruto', q: 'Name a member of the Akatsuki', a: `
E Itachi Uchiha | itachi | uchiha itachi
E Pain | pein | six paths of pain
D Deidara
D Kisame Hoshigaki | kisame | hoshigaki kisame
C Obito Uchiha | obito | tobi | uchiha obito | masked man | madara
C Sasori | sasori of the red sand
C Hidan
B Konan
B Kakuzu
B Nagato | nagato uzumaki
A Zetsu | black zetsu | white zetsu
A Orochimaru
S Yahiko` },

{ id: 'ff7-party', lvl: 3, cat: 'Video games', src: 'Final Fantasy VII', q: 'Name a playable party member in Final Fantasy VII', a: `
E Cloud Strife | cloud
E Tifa Lockhart | tifa
D Aerith Gainsborough | aerith | aeris
D Barret Wallace | barret | barrett
C Red XIII | red 13 | red xiii | nanaki | red thirteen
C Vincent Valentine | vincent
B Yuffie Kisaragi | yuffie
B Cid Highwind | cid
A Cait Sith | caitsith | cait
S Zack Fair | zack
S Sephiroth | seph` },

{ id: 'aot-titans', lvl: 3, cat: 'Anime', src: 'Attack on Titan', q: 'Name one of the Nine Titans in Attack on Titan', a: `
E Colossal Titan | colossal | colossus titan | colossus
E Attack Titan | attack | erens titan | eren titan
D Armored Titan | armored | armoured titan | armour titan | armoured
D Female Titan | female | annies titan | annie titan
C Founding Titan | founding | founder titan | founder | coordinate
C Beast Titan | beast | zekes titan
B Jaw Titan | jaw
A Cart Titan | cart | panzer titan
A War Hammer Titan | war hammer | warhammer titan | warhammer` },

/* ───────────── LEVEL 4 ───────────── */
{ id: 'ghibli', lvl: 4, cat: 'Anime', src: 'Studio Ghibli', q: 'Name a Studio Ghibli film', a: `
E Spirited Away
E My Neighbor Totoro | totoro | my neighbour totoro
D Howl's Moving Castle | howls moving castle | howls
D Princess Mononoke | mononoke
D Kiki's Delivery Service | kikis delivery service | kiki
D Ponyo | ponyo on the cliff by the sea
C Castle in the Sky | laputa | laputa castle in the sky
C Grave of the Fireflies
C Nausicaä of the Valley of the Wind | nausicaa | nausicaa of the valley of the wind
B The Wind Rises | wind rises
B The Boy and the Heron | boy and the heron | how do you live
B Porco Rosso
B Whisper of the Heart
B Arrietty | the secret world of arrietty | secret world of arrietty | the borrower arrietty
A The Cat Returns | cat returns
A The Tale of the Princess Kaguya | princess kaguya | tale of princess kaguya | kaguya
A When Marnie Was There | marnie
A From Up on Poppy Hill | poppy hill
A Tales from Earthsea | earthsea
A Pom Poko
S Only Yesterday
S Ocean Waves
S My Neighbors the Yamadas | my neighbours the yamadas | the yamadas
S Earwig and the Witch | earwig
S The Red Turtle | red turtle` },

{ id: 'sf2', lvl: 4, cat: 'Video games', src: 'Street Fighter II', q: 'Name a Street Fighter II character', a: `
E Ryu
E Ken | ken masters
E Chun-Li | chunli | chun li
D Guile
D Blanka
D Zangief
C M. Bison | bison | m bison | dictator | vega (jp)
C Dhalsim
C E. Honda | honda | e honda | edmond honda
B Sagat
B Vega | claw | balrog (jp)
B Balrog | boxer | mike bison
B Cammy | cammy white
B Akuma | gouki
A Fei Long | feilong
S T. Hawk | thawk | t hawk | thunder hawk
S Dee Jay | deejay` },

{ id: 'dbz-villains', lvl: 4, cat: 'Anime', src: 'Dragon Ball Z', q: 'Name a Dragon Ball Z villain', a: `
E Frieza | freeza | freezer
E Cell | perfect cell
D Majin Buu | buu | kid buu | fat buu | super buu | boo | majin boo | kid boo
D Vegeta
C Broly
C Raditz
C Nappa
B Captain Ginyu | ginyu | ginyu force
B Babidi
B Dabura
B Cooler
B Android 17 | 17
B Android 18 | 18
B Dr. Gero | android 20 | gero | doctor gero
A Zarbon
A Dodoria
A Recoome
A Jeice
A Burter
A Guldo
A King Cold
A Android 19 | 19
A Janemba
A Cell Jr. | cell jr | cell junior | cell juniors
A Android 16 | 16
S Turles
S Lord Slug | slug
S Garlic Jr. | garlic jr | garlic junior
S Spopovich
S Yamu
S Pui Pui | puipui
S Yakon
S Bojack | bo jack
S Hirudegarn
B Android 13` },

/* ───────────── LEVEL 5 ───────────── */
{ id: 'p5-thieves', lvl: 5, cat: 'Video games', src: 'Persona 5', q: 'Name a Phantom Thief from Persona 5', a: `
E Joker | ren amamiya | akira kurusu | ren | protagonist
D Morgana | mona
D Ryuji Sakamoto | ryuji | skull
D Ann Takamaki | ann | panther
C Makoto Niijima | makoto | queen
C Futaba Sakura | futaba | oracle
C Yusuke Kitagawa | yusuke | fox
C Goro Akechi | akechi | goro | crow
B Haru Okumura | haru | noir
A Kasumi Yoshizawa | kasumi | violet | sumire | sumire yoshizawa
A Sophia (Persona 5 Strikers) | sophia
A Zenkichi Hasegawa (Persona 5 Strikers) | zenkichi | wolf` },

{ id: 'jjk-tokyo', lvl: 5, cat: 'Anime', src: 'Jujutsu Kaisen', q: 'Name a student or teacher at Tokyo Jujutsu High', a: `
E Yuji Itadori | yuji | itadori
E Satoru Gojo | gojo | satoru
D Megumi Fushiguro | megumi | fushiguro
D Nobara Kugisaki | nobara | kugisaki
C Maki Zen'in | maki | maki zenin
C Yuta Okkotsu | yuta | okkotsu
C Toge Inumaki | toge | inumaki
C Panda
B Kento Nanami | nanami | kento
B Suguru Geto | geto | suguru
A Shoko Ieiri | shoko | ieiri
A Masamichi Yaga | yaga | masamichi | principal yaga
A Kinji Hakari | hakari | kinji
S Kirara Hoshi | kirara | hoshi
S Kiyotaka Ijichi | ijichi | kiyotaka
S Yu Haibara | haibara` },

{ id: 'ds1-bosses', lvl: 5, cat: 'Video games', src: 'Dark Souls', q: 'Name a boss from the original Dark Souls', a: `
E Ornstein and Smough | ornstein | smough | ornstein & smough | o&s | dragonslayer ornstein | executioner smough
D Gwyn, Lord of Cinder | gwyn | lord gwyn
D Great Grey Wolf Sif | sif
D Knight Artorias | artorias
C Capra Demon | capra
C Chaos Witch Quelaag | quelaag
C Manus, Father of the Abyss | manus
C Taurus Demon | taurus
C Asylum Demon
B Bell Gargoyles | bell gargoyle | gargoyles
B Four Kings | the four kings
B Seath the Scaleless | seath
B Gravelord Nito | nito
B Crossbreed Priscilla | priscilla
B Black Dragon Kalameet | kalameet
B Gaping Dragon
B Dark Sun Gwyndolin | gwyndolin
A Iron Golem
A Pinwheel
A Moonlight Butterfly
A Bed of Chaos
A Centipede Demon
A Sanctuary Guardian
S Ceaseless Discharge
S Stray Demon
S Demon Firesage | firesage
B Hydra` },

/* ───────────── LEVEL 6 ───────────── */
{ id: 'mappa', lvl: 6, cat: 'Anime', src: 'Studio MAPPA', q: 'Name an anime produced by studio MAPPA', a: `
E Jujutsu Kaisen | jjk
E Chainsaw Man | csm
D Attack on Titan: The Final Season | attack on titan | attack on titan final season | aot | shingeki no kyojin
D Hell's Paradise | hells paradise | jigokuraku
C Vinland Saga
C Yuri!!! on Ice | yuri on ice
C Dorohedoro
C Banana Fish
C Zombie Land Saga | zombieland saga
C Kakegurui
B Dororo
B The God of High School | god of high school
B Terror in Resonance | zankyou no terror
B Kids on the Slope | sakamichi no apollon
B Inuyashiki
B Lazarus
A In This Corner of the World | in this corner of the world
A Takt Op. Destiny | takt op destiny
A Rage of Bahamut: Virgin Soul | rage of bahamut virgin soul | virgin soul
A Garo: The Animation | garo
A Punch Line | punchline
A Ushio & Tora | ushio and tora
A Days
S Listeners
S Re-Main | remain
S Bucchigiri?! | bucchigiri
B Campfire Cooking in Another World
A Zenshu` },

{ id: 'fromsoft', lvl: 6, cat: 'Video games', src: 'FromSoftware', q: 'Name a game developed by FromSoftware', a: `
E Elden Ring | shadow of the erdtree | erdtree
E Dark Souls | ds1 | dark souls 1
D Bloodborne
D Sekiro: Shadows Die Twice | sekiro
D Dark Souls III | dark souls 3 | ds3
C Demon's Souls | demons souls
C Dark Souls II | dark souls 2 | ds2 | scholar of the first sin
C Armored Core VI: Fires of Rubicon | armored core 6 | armored core vi | ac6 | fires of rubicon
B Armored Core | armored core 1 | armoured core
B Elden Ring Nightreign | nightreign
B King's Field | kings field
A Shadow Tower
A Déraciné | deracine
A Otogi: Myth of Demons | otogi
A Metal Wolf Chaos
A Chromehounds
A Ninja Blade
S Echo Night
S Lost Kingdoms
S Enchanted Arms
S Evergrace
S Eternal Ring
S Spriggan: Lunar Verse | spriggan
S Murakumo | murakumo renegade mech pursuit
S Kuon
B The Duskbloods | duskbloods` },

{ id: 'hxh-troupe', lvl: 6, cat: 'Anime', src: 'Hunter x Hunter', q: 'Name a member of the Phantom Troupe', a: `
E Chrollo Lucilfer | chrollo | kuroro | kuroro lucifer | chrollo lucifer
E Hisoka | hisoka morow
D Feitan | feitan portor
D Uvogin | uvo
C Machi | machi komacine
C Nobunaga | nobunaga hazama
C Phinks | phinks magcub | finks
C Shalnark | shalnark
B Pakunoda | paku
B Shizuku | shizuku murasaki
B Franklin | franklin bordeau
B Kalluto | kalluto zoldyck | karuto
A Bonolenov | bonolenov ndongo
A Kortopi | coltopi
S Omokage
A Illumi Zoldyck | illumi` },

/* ───────────── LEVEL 7 · hardest ───────────── */
{ id: 'gundam', lvl: 7, cat: 'Anime', src: 'Gundam', q: 'Name a Gundam anime series or film', a: `
E Mobile Suit Gundam | gundam 0079 | 0079 | first gundam | original gundam
E Gundam Wing | mobile suit gundam wing | wing | endless waltz | gundam wing endless waltz
D Mobile Suit Gundam: The Witch from Mercury | witch from mercury | g witch | the witch from mercury
D Iron-Blooded Orphans | iron blooded orphans | ibo
D Gundam SEED | seed | mobile suit gundam seed
C Gundam 00 | 00 | double o | gundam double o
C Zeta Gundam | z gundam | mobile suit zeta gundam
C Gundam Unicorn | unicorn
C Char's Counterattack | chars counterattack | cca
C G Gundam | mobile fighter g gundam
C Gundam SEED Destiny | seed destiny
B Gundam ZZ | double zeta | gundam double zeta | zz
B Gundam: Hathaway | hathaway | hathaways flash | hathaway's flash
B The Origin | gundam the origin
B Gundam Thunderbolt | thunderbolt
B Gundam Build Fighters | build fighters
B 0080: War in the Pocket | war in the pocket | 0080 | gundam 0080
B 0083: Stardust Memory | stardust memory | 0083 | gundam 0083
B The 08th MS Team | 08th ms team | 08th ms team | 08 ms team
B GQuuuuuuX | gquuuuuux | gundam gquuuuuux
B Gundam SEED Freedom | seed freedom
A Victory Gundam | v gundam | victory
A Gundam X | after war gundam x
A Turn A Gundam | turn a | turn-a
A Gundam AGE | age
A Gundam F91 | f91
A Gundam Build Fighters Try | build fighters try
A Gundam Build Divers | build divers
A Gundam Reconguista in G | reconguista in g | g-reco | g reco
S Gundam Evolve | evolve
S Gundam: Cucuruz Doan's Island | cucuruz doans island | cucuruz doan
S Gundam Requiem for Vengeance | requiem for vengeance
S MS IGLOO | igloo
S SD Gundam Force | sd gundam
S Gundam Narrative | narrative
A Awakening of the Trailblazer (Gundam 00 film) | awakening of the trailblazer | gundam 00 awakening of the trailblazer` },

{ id: 'elden-demigods', lvl: 7, cat: 'Video games', src: 'Elden Ring', q: 'Name a demigod from Elden Ring', a: `
E Malenia | malenia blade of miquella
E Radahn | starscourge radahn | general radahn
D Godrick the Grafted | godrick
D Morgott the Omen King | morgott | margit
C Rykard | rykard lord of blasphemy
C Mohg | mohg lord of blood
C Ranni | ranni the witch
B Miquella | miquella the unalloyed
B Messmer | messmer the impaler
A Godwyn | godwyn the golden` },

{ id: 'mgs-bosses', lvl: 7, cat: 'Video games', src: 'Metal Gear Solid', q: 'Name a boss from the Metal Gear Solid series', a: `
E The Boss
E Psycho Mantis | mantis
D Liquid Snake | liquid
D Revolver Ocelot | ocelot
C Sniper Wolf
C The End
C The Sorrow
C Vamp
C Volgin | colonel volgin
B Vulcan Raven | raven
B Fatman
B The Fear
B The Fury
B The Pain
B Fortune
B Solidus Snake | solidus
B Gray Fox | grey fox | cyborg ninja | ninja
B Liquid Ocelot
A Metal Gear REX | rex
A Shagohod
A Olga Gurlukovich | olga
A The Cobra Unit | cobras | cobra unit
S Decoy Octopus
S Laughing Octopus
S Raging Raven
S Crying Wolf
S Screaming Mantis
S Metal Gear RAY | ray
C Quiet
B Sahelanthropus
B The Man on Fire | man on fire` },
];
