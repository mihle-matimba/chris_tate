// Shared accommodation catalogue + bank details (used by the RSVP page and the admin dashboard).
// Rates are per person, per night, VAT included. KEEP IN SYNC with supabase/accommodation.sql (server re-checks prices).
(function () {
  var rooms = [
    { id: 'irafi-1', group: 'House Irafi', label: 'House Irafi · Room 1', short: 'Irafi R1', rate: 1600, cap: 2, note: 'En-suite, 2 x 3/4 beds' },
    { id: 'irafi-2', group: 'House Irafi', label: 'House Irafi · Room 2', short: 'Irafi R2', rate: 1600, cap: 2, note: 'En-suite, 2 x 3/4 beds' },
    { id: 'irafi-3', group: 'House Irafi', label: 'House Irafi · Room 3 (Honeymoon Suite)', short: 'Irafi R3', rate: 1925, cap: 2, note: 'Queen bed, en-suite bath, patio with jacuzzi' },
    { id: 'ibala', group: 'Ibala-Bala Chalets', label: 'Ibala-Bala Chalet', short: 'Ibala-Bala', rate: 1045, cap: 20, note: '4 chalets, each sleeps 5' },
    { id: 'malazi-1', group: 'Malazi Houses', label: 'Malazi 1', short: 'Malazi 1', rate: 950, cap: 8, note: 'Sleeps 8' },
    { id: 'malazi-2', group: 'Malazi Houses', label: 'Malazi 2', short: 'Malazi 2', rate: 950, cap: 12, note: 'Sleeps 12' },
    { id: 'malazi-3', group: 'Malazi Houses', label: 'Malazi 3', short: 'Malazi 3', rate: 950, cap: 12, note: 'Sleeps 12' },
    { id: 'malazi-4', group: 'Malazi Houses', label: 'Malazi 4', short: 'Malazi 4', rate: 950, cap: 12, note: 'Sleeps 12' },
    { id: 'malazi-5', group: 'Malazi Houses', label: 'Malazi 5', short: 'Malazi 5', rate: 950, cap: 10, note: 'Sleeps 10' },
    { id: 'inyati', group: 'Inyati', label: 'Inyati', short: 'Inyati', rate: 950, cap: 8, note: 'Sleeps 8' },
    { id: 'amani', group: 'Amani', label: 'Amani', short: 'Amani', rate: 850, cap: 6, note: 'Sleeps 6. Fans only, no aircon' }
  ];
  ['Sefata', 'Tulia', 'Ilanga', 'Sehlala'].forEach(function (u) {
    var k = u.toLowerCase();
    rooms.push({ id: k + '-a', group: 'Units', label: u + ' · Rooms 1 & 8', short: u + ' R1&8', rate: 1080, cap: 4, note: 'Max 2 per room. Kettle & coffee only, no kitchen' });
    rooms.push({ id: k + '-b', group: 'Units', label: u + ' · Rooms 2 to 7', short: u + ' R2-7', rate: 970, cap: 12, note: 'Max 2 per room. Kettle & coffee only, no kitchen' });
  });
  window.ROOMS = rooms;
  window.NIGHTS = { both_nights: 2, friday_only: 1 };
  window.BANK = {
    bank: 'First National Bank (FNB)',
    holder: 'Social Trading Academy (Pty) Ltd',
    type: 'Gold Business Account',
    number: '63012534889',
    branch: '252445',
    branchName: 'Menlyn Maine',
    swift: 'FIRNZAJJ',
    pdf: 'https://pehrklnvmjwsuyjyjtjq.supabase.co/storage/v1/object/public/Wedding%20Pictures/c29eb76b2ee3f3a8a8626f881759a621.pdf'
  };
  // Plain-text bank details for the "copy" buttons. reference/amount are optional.
  window.bankText = function (reference, amount) {
    var b = window.BANK;
    return ['Bank: ' + b.bank, 'Account holder: ' + b.holder, 'Account type: ' + b.type, 'Account number: ' + b.number,
      'Branch: ' + b.branchName + ' (' + b.branch + ')', 'Swift: ' + b.swift]
      .concat(amount ? ['Amount: ' + amount] : [], reference ? ['Reference: ' + reference] : []).join('\n');
  };
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy-bank]');
    if (!btn) return;
    var text = window.bankText(btn.dataset.ref || '', btn.dataset.amount || '');
    var done = function () { var o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = o; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (x) {} t.remove(); }
  });
})();
