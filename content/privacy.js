/**
 * Privacy policy text. The page is built only when the controller details in config.legal
 * are filled in and privacyPolicyReady is true. Have a lawyer review it first, in particular
 * the data localisation rules of the Law of Uzbekistan on Personal Data.
 */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

module.exports = {
  ru: (cfg) => {
    const l = cfg.legal;
    return `
<p>Эта политика описывает, как <span translate="no">${esc(l.operatorName)}</span> (ИНН ${esc(l.taxId)}, адрес: <span translate="no">${esc(l.legalAddress)}</span>) обрабатывает данные, которые вы оставляете на сайте QADOQLAB.</p>
<h2>Какие данные мы получаем</h2>
<p>Только то, что вы сами указываете в форме запроса: название компании, имя или обращение, контакт для связи (телефон, email или Telegram), город, описание задачи, параметры упаковки и, если вы их прикладываете, файлы.</p>
<h2>Для чего</h2>
<p>Чтобы подготовить предложение по вашему запросу и связаться с вами по указанному контакту. Мы не используем эти данные для рекламных рассылок и не передаём их третьим лицам, кроме сервиса доставки электронной почты, через который заявка поступает представителю компании.</p>
<h2>Аналитика</h2>
<p>Если на сайте подключена статистика посещений, в неё передаются только обезличенные события (например, «форма отправлена»), без имени, контактов, текста запроса и файлов.</p>
<h2>Сроки хранения</h2>
<p>Данные запроса хранятся в почтовом ящике компании, пока они нужны для работы с вашим обращением. Вы можете попросить удалить их раньше.</p>
<h2>Ваши права</h2>
<p>Вы можете узнать, какие ваши данные у нас есть, попросить исправить или удалить их, написав на <a href="mailto:${esc(l.privacyContactEmail)}">${esc(l.privacyContactEmail)}</a>.</p>`;
  },
  uz: (cfg) => {
    const l = cfg.legal;
    return `
<p>Ushbu siyosat <span translate="no">${esc(l.operatorName)}</span> (STIR ${esc(l.taxId)}, manzil: <span translate="no">${esc(l.legalAddress)}</span>) QADOQLAB saytida qoldirgan ma’lumotlaringizga qanday ishlov berishini tushuntiradi.</p>
<h2>Qanday ma’lumotlarni olamiz</h2>
<p>Faqat so‘rov shaklida o‘zingiz ko‘rsatgan ma’lumotlar: kompaniya nomi, ism yoki murojaat shakli, aloqa (telefon, email yoki Telegram), shahar, vazifa tavsifi, qadoq parametrlari va ilova qilsangiz — fayllar.</p>
<h2>Nima uchun</h2>
<p>So‘rovingiz bo‘yicha taklif tayyorlash va ko‘rsatilgan aloqa orqali siz bilan bog‘lanish uchun. Bu ma’lumotlardan reklama xabarnomalari uchun foydalanmaymiz va ularni uchinchi shaxslarga bermaymiz, so‘rovni kompaniya vakiliga yetkazadigan elektron pochta xizmati bundan mustasno.</p>
<h2>Analitika</h2>
<p>Saytda tashrif statistikasi ulangan bo‘lsa, unga faqat shaxssizlantirilgan hodisalar (masalan, «shakl yuborildi») uzatiladi — ism, aloqa, so‘rov matni va fayllarsiz.</p>
<h2>Saqlash muddati</h2>
<p>So‘rov ma’lumotlari murojaatingiz bilan ishlash uchun kerak bo‘lgan muddat davomida kompaniya pochta qutisida saqlanadi. Ularni ertaroq o‘chirishni so‘rashingiz mumkin.</p>
<h2>Huquqlaringiz</h2>
<p><a href="mailto:${esc(l.privacyContactEmail)}">${esc(l.privacyContactEmail)}</a> manziliga yozib, qaysi ma’lumotlaringiz bizda borligini bilishingiz, ularni tuzatish yoki o‘chirishni so‘rashingiz mumkin.</p>`;
  },
};
