export interface Suggestion { host: string; label: string }
export interface SuggestionGroup { category: string; items: Suggestion[] }

// Registrable domains of services that are frequent phishing targets in Japan.
// Listing here is a convenience for the user's own registration, not an endorsement or a safety claim.
export const SUGGESTED_DOMAINS: SuggestionGroup[] = [
  { category: '銀行', items: [
    { host: 'mufg.jp', label: '三菱UFJ銀行' },
    { host: 'smbc.co.jp', label: '三井住友銀行' },
    { host: 'mizuhobank.co.jp', label: 'みずほ銀行' },
    { host: 'japanpost.jp', label: 'ゆうちょ銀行・日本郵便' },
    { host: 'rakuten-bank.co.jp', label: '楽天銀行' },
    { host: 'paypay-bank.co.jp', label: 'PayPay銀行' },
    { host: 'netbk.co.jp', label: '住信SBIネット銀行' },
    { host: 'jibunbank.co.jp', label: 'auじぶん銀行' },
    { host: 'sevenbank.co.jp', label: 'セブン銀行' },
    { host: 'aeonbank.co.jp', label: 'イオン銀行' },
  ] },
  { category: 'カード・決済', items: [
    { host: 'jcb.co.jp', label: 'JCB' },
    { host: 'smbc-card.com', label: '三井住友カード' },
    { host: 'rakuten-card.co.jp', label: '楽天カード' },
    { host: 'saisoncard.co.jp', label: 'セゾンカード' },
    { host: 'd-card.jp', label: 'dカード' },
    { host: 'americanexpress.com', label: 'アメリカン・エキスプレス' },
    { host: 'paypay.ne.jp', label: 'PayPay' },
    { host: 'merpay.com', label: 'メルペイ' },
    { host: 'paypal.com', label: 'PayPal' },
  ] },
  { category: '通販・サービス', items: [
    { host: 'amazon.co.jp', label: 'Amazon' },
    { host: 'rakuten.co.jp', label: '楽天市場' },
    { host: 'yahoo.co.jp', label: 'Yahoo! JAPAN' },
    { host: 'mercari.com', label: 'メルカリ' },
    { host: 'apple.com', label: 'Apple' },
    { host: 'google.com', label: 'Google' },
    { host: 'microsoft.com', label: 'Microsoft' },
    { host: 'line.me', label: 'LINE' },
  ] },
  { category: '物流・交通', items: [
    { host: 'kuronekoyamato.co.jp', label: 'ヤマト運輸' },
    { host: 'sagawa-exp.co.jp', label: '佐川急便' },
    { host: 'etc-meisai.jp', label: 'ETC利用照会サービス' },
    { host: 'eki-net.com', label: 'えきねっと' },
    { host: 'smart-ex.jp', label: 'スマートEX' },
    { host: 'jal.co.jp', label: 'JAL' },
    { host: 'ana.co.jp', label: 'ANA' },
  ] },
  { category: '通信・公的機関', items: [
    { host: 'docomo.ne.jp', label: 'NTTドコモ' },
    { host: 'au.com', label: 'au' },
    { host: 'softbank.jp', label: 'ソフトバンク' },
    { host: 'myna.go.jp', label: 'マイナポータル' },
    { host: 'nta.go.jp', label: '国税庁' },
    { host: 'nenkin.go.jp', label: '日本年金機構' },
  ] },
];
