/**
 * Catalog categories. Publishing is controlled by catalogPublished in the settings.
 * Texts describe what each box type is for and what has to be agreed — deliberately
 * no prices, stock, load ratings, lead times or minimum runs.
 */
module.exports = [
  {
    slug: 'transport-boxes',
    art: 'transport',
    requires: [],
    ru: {
      name: 'Транспортные гофрокороба',
      short: 'Для перевозки, хранения и отгрузки продукции партиями.',
      intro:
        'Гофрокороб — основная тара для перевозки и складского хранения. Конструкцию и картон подбирают под вес содержимого, способ укладки и условия, в которых коробка будет находиться в пути и на складе.',
      uses: [
        'Отгрузка готовой продукции со склада',
        'Перевозка товара в индивидуальной упаковке',
        'Хранение на стеллажах и паллетах',
      ],
      alt: 'Иллюстрация: закрытый крафтовый гофрокороб, заклеенный лентой',
    },
    uz: {
      name: 'Transport gofroqutilari',
      short: 'Mahsulotni partiyalab tashish, saqlash va jo‘natish uchun.',
      intro:
        'Gofroquti — tashish va omborda saqlash uchun asosiy idish. Konstruksiya va karton ichidagi mahsulot vazni, taxlash usuli hamda quti yo‘lda va omborda bo‘ladigan sharoitga qarab tanlanadi.',
      uses: [
        'Tayyor mahsulotni ombordan jo‘natish',
        'Alohida qadoqlangan tovarni tashish',
        'Javon va paddonlarda saqlash',
      ],
      alt: 'Illyustratsiya: lenta bilan yopishtirilgan yopiq kraft gofroquti',
    },
  },
  {
    slug: 'four-flap-boxes',
    art: 'open',
    requires: [],
    ru: {
      name: 'Четырёхклапанные коробки',
      short: 'Классическая конструкция: клапаны сверху и снизу, сборка без клея.',
      intro:
        'Распространённая конструкция с четырьмя клапанами на каждой стороне. Подходит для широкого круга товаров: размеры задаются под содержимое, клапаны закрываются лентой.',
      uses: ['Транспортная упаковка для разных товаров', 'Групповая упаковка изделий', 'Складское хранение'],
      alt: 'Иллюстрация: открытая четырёхклапанная коробка, виден срез гофрокартона',
    },
    uz: {
      name: 'To‘rt klapanli qutilar',
      short: 'Klassik konstruksiya: yuqorida va pastda klapanlar, yelimsiz yig‘iladi.',
      intro:
        'Har bir tomonida to‘rttadan klapani bo‘lgan keng tarqalgan konstruksiya. Turli tovarlar uchun mos: o‘lchamlar mahsulotga qarab belgilanadi, klapanlar lenta bilan yopiladi.',
      uses: ['Turli tovarlar uchun transport qadog‘i', 'Buyumlarni guruhlab qadoqlash', 'Omborda saqlash'],
      alt: 'Illyustratsiya: ochiq to‘rt klapanli quti, gofrokarton kesimi ko‘rinadi',
    },
  },
  {
    slug: 'die-cut-boxes',
    art: 'mailer',
    requires: [],
    ru: {
      name: 'Самосборные коробки',
      short: 'Собираются из развёртки без ленты и клея.',
      intro:
        'Коробка с откидной крышкой и замками, которая собирается из плоской развёртки. Удобна, когда важны аккуратный вид и быстрая сборка на месте упаковки.',
      uses: ['Упаковка отдельных изделий', 'Наборы и подарочные комплекты', 'Отправка заказов покупателям'],
      alt: 'Иллюстрация: самосборная коробка с открытой крышкой',
    },
    uz: {
      name: 'O‘zi yig‘iladigan qutilar',
      short: 'Yoyilmadan lenta va yelimsiz yig‘iladi.',
      intro:
        'Ochiladigan qopqoqli va qulflari bor quti tekis yoyilmadan yig‘iladi. Tashqi ko‘rinish va qadoqlash joyida tez yig‘ish muhim bo‘lganda qulay.',
      uses: [
        'Alohida buyumlarni qadoqlash',
        'To‘plamlar va sovg‘a jamlanmalari',
        'Buyurtmalarni xaridorlarga yuborish',
      ],
      alt: 'Illyustratsiya: qopqog‘i ochiq o‘zi yig‘iladigan quti',
    },
  },
  {
    slug: 'apparel-boxes',
    art: 'flat',
    requires: [],
    ru: {
      name: 'Коробки для одежды и текстиля',
      short: 'Для хранения и отгрузки готовых изделий.',
      intro:
        'Размеры коробки удобно рассчитывать от состава партии: сколько изделий и в каком сложенном виде должно поместиться. Для текстиля важны также условия хранения и способ доставки.',
      uses: ['Отгрузка партий одежды', 'Хранение готовых изделий', 'Упаковка домашнего текстиля'],
      alt: 'Иллюстрация: невысокая коробка для одежды со снятой крышкой',
    },
    uz: {
      name: 'Kiyim va to‘qimachilik uchun qutilar',
      short: 'Tayyor buyumlarni saqlash va jo‘natish uchun.',
      intro:
        'Quti o‘lchamini partiya tarkibidan kelib chiqib hisoblash qulay: nechta buyum va qanday buklangan holda sig‘ishi kerak. To‘qimachilik uchun saqlash sharoiti va yetkazib berish usuli ham muhim.',
      uses: ['Kiyim partiyalarini jo‘natish', 'Tayyor buyumlarni saqlash', 'Uy to‘qimachiligini qadoqlash'],
      alt: 'Illyustratsiya: qopqog‘i olingan past kiyim qutisi',
    },
  },
  {
    slug: 'ecommerce-boxes',
    art: 'mailerClosed',
    requires: [],
    ru: {
      name: 'Коробки для интернет-заказов',
      short: 'Под содержимое заказа и способ доставки.',
      intro:
        'Для интернет-торговли коробку подбирают под типовой состав заказа, чтобы товар не болтался внутри и не приходилось платить за лишний объём при доставке.',
      uses: ['Заказы интернет-магазинов', 'Отправки для маркетплейсов', 'Курьерская доставка'],
      alt: 'Иллюстрация: закрытая коробка для отправки интернет-заказа',
    },
    uz: {
      name: 'Internet-buyurtmalar uchun qutilar',
      short: 'Buyurtma tarkibi va yetkazib berish usuliga qarab.',
      intro:
        'Internet-savdo uchun quti odatiy buyurtma tarkibiga qarab tanlanadi: tovar ichida qimirlamasligi va yetkazib berishda ortiqcha hajm uchun to‘lamaslik uchun.',
      uses: ['Internet-do‘kon buyurtmalari', 'Marketpleyslar uchun jo‘natmalar', 'Kuryerlik yetkazib berish'],
      alt: 'Illyustratsiya: internet-buyurtma uchun yopiq quti',
    },
  },
  {
    slug: 'archive-boxes',
    art: 'archive',
    requires: [],
    ru: {
      name: 'Архивные коробки',
      short: 'Для хранения документов и папок.',
      intro:
        'Коробки для документов рассчитывают под формат папок и способ хранения: на полках, в шкафах или стопкой. Удобство переноски и подписи обсуждаются при расчёте.',
      uses: ['Архивы организаций', 'Хранение бухгалтерских документов', 'Перевозка документов при переезде'],
      alt: 'Иллюстрация: архивная коробка с прорезью-ручкой',
    },
    uz: {
      name: 'Arxiv qutilari',
      short: 'Hujjatlar va papkalarni saqlash uchun.',
      intro:
        'Hujjat qutilari papkalar formati va saqlash usuliga qarab hisoblanadi: javonda, shkafda yoki ustma-ust. Ko‘tarib yurish qulayligi va belgilash hisob-kitob paytida kelishiladi.',
      uses: ['Tashkilot arxivlari', 'Buxgalteriya hujjatlarini saqlash', 'Ko‘chishda hujjatlarni tashish'],
      alt: 'Illyustratsiya: tutqich teshigi bor arxiv qutisi',
    },
  },
  {
    slug: 'custom-boxes',
    art: 'dieline',
    requires: [],
    ru: {
      name: 'Упаковка по индивидуальным требованиям',
      short: 'Когда стандартная конструкция не подходит.',
      intro:
        'Если у продукции нестандартная форма, особые требования к защите или вы уже используете коробку, которую нужно повторить, — пришлите описание, размеры, фото или чертёж. Возможность изготовления уточним после изучения задачи.',
      uses: ['Повтор коробки по образцу или чертежу', 'Нестандартные размеры', 'Особые требования к конструкции'],
      alt: 'Иллюстрация: развёртка коробки с линиями сгиба',
    },
    uz: {
      name: 'Maxsus talablar bo‘yicha qadoq',
      short: 'Standart konstruksiya mos kelmaganda.',
      intro:
        'Mahsulotingiz shakli nostandart bo‘lsa, himoyaga alohida talablar bo‘lsa yoki mavjud qutini takrorlash kerak bo‘lsa — tavsif, o‘lchamlar, foto yoki chizmani yuboring. Tayyorlash imkoniyatini vazifani o‘rganib chiqqach aniqlaymiz.',
      uses: [
        'Namuna yoki chizma bo‘yicha qutini takrorlash',
        'Nostandart o‘lchamlar',
        'Konstruksiyaga alohida talablar',
      ],
      alt: 'Illyustratsiya: buklash chiziqlari bor quti yoyilmasi',
    },
  },
  {
    slug: 'printed-boxes',
    art: 'printed',
    requires: ['printing'],
    ru: {
      name: 'Коробки с печатью',
      short: 'Логотип или изображение на коробке.',
      intro:
        'Нанесение логотипа помогает узнавать продукцию на складе и у получателя. Пришлите макет или описание — параметры печати согласуем при расчёте.',
      uses: ['Логотип на транспортной коробке', 'Маркировка продукции', 'Брендированная упаковка заказов'],
      alt: 'Иллюстрация: крафтовая коробка с нанесённым знаком',
    },
    uz: {
      name: 'Bosma tushirilgan qutilar',
      short: 'Qutida logotip yoki tasvir.',
      intro:
        'Logotip mahsulotni omborda va qabul qiluvchida tanib olishga yordam beradi. Maket yoki tavsifni yuboring — bosma parametrlarini hisob-kitob paytida kelishamiz.',
      uses: ['Transport qutisida logotip', 'Mahsulotni markirovka qilish', 'Brendlangan buyurtma qadog‘i'],
      alt: 'Illyustratsiya: belgi tushirilgan kraft quti',
    },
  },
];
