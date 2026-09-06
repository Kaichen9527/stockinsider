import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFinancialResponse, parseTpexFinancialEndpoint } from './candidate-financial-acquisition.ts';

test('TPEx general and stock-broker statements use their documented, distinct headers', () => {
  const general = parseTpexFinancialEndpoint('generalIncome', [{
    Date: '1150905', Year: '115', Season: '2', SecuritiesCompanyCode: '1240',
    營業收入: '1440672.00', '營業毛利（毛損）淨額': '219087.00', '營業利益（損失）': '87402.00',
    '本期淨利（淨損）': '126506.00', '淨利（損）歸屬於母公司業主': '120000.00',
    '基本每股盈餘（元）': '2.10', '稀釋每股盈餘（元）': '2.05',
  }]);
  const broker = parseTpexFinancialEndpoint('brokerIncome', [{
    Date: '1150905', 年度: '115', 季別: '2', 公司代號: '5864', 收益: '5225386.00', 營業利益: '4970278.00',
    '本期淨利（淨損）': '4942435.00', '基本每股盈餘（元）': '9.80',
  }]);
  assert.equal(general.terminalReason, 'complete');
  assert.deepEqual(general.facts.map((fact) => fact.factKey), [
    'quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income',
    'quarterly_net_income', 'quarterly_net_income_attributable_to_common', 'quarterly_basic_eps', 'quarterly_diluted_eps',
  ]);
  assert.equal(broker.facts.find((fact) => fact.factKey === 'quarterly_revenue')?.value, 5225386);
  assert.equal(broker.facts.some((fact) => fact.factKey === 'quarterly_gross_profit'), false);
});

test('TPEx balance rows preserve endpoint-specific equity label and reject security HTML', () => {
  const result = parseTpexFinancialEndpoint('brokerBalance', [{
    出表日期: '1150905', 年度: '115', 季別: '2', 公司代號: '5864', 資產總計: '19400794.00',
    負債總計: '6504885.00', 權益總計: '12895909.00', '每股參考淨值': '28.37',
  }]);
  assert.equal(result.facts.find((fact) => fact.factKey === 'book_value_per_share')?.value, 28.37);
  assert.equal(result.facts.some((fact) => fact.factKey === 'total_debt'), false, 'total liabilities are not interest-bearing debt');
  assert.equal(classifyFinancialResponse(200, 'text/html', '<html>captcha security check</html>'), 'security_blocked');
  assert.equal(classifyFinancialResponse(200, 'text/html', '<html>temporary page</html>'), 'html_rejected');
});

test('MOPS 307 security body is classified as a security block instead of a generic network failure', () => {
  const body = '<html><body>因為安全性考量，您所執行的頁面無法呈現。 FOR SECURITY REASONS, THIS PAGE CAN NOT BE ACCESSED.</body></html>';
  assert.equal(classifyFinancialResponse(307, 'text/html; charset=UTF-8', body, 'html'), 'security_blocked');
  assert.equal(classifyFinancialResponse(200, 'text/html; charset=UTF-8', '<html><body><ix:nonFraction>1</ix:nonFraction></body></html>', 'html'), null);
});

test('TPEx accepts the live alternate statement labels without emitting competing facts', () => {
  const result = parseTpexFinancialEndpoint('generalIncome', [{
    Date: '1150906', Year: '115', Season: '2', SecuritiesCompanyCode: '1240',
    營業收入: '1440672.00', '營業毛利（毛損）': '219087.00', 營業費用: '131685.00',
    '營業外收入及支出': '54301.00', '稅前淨利（淨損）': '141703.00', '所得稅費用（利益）': '15197.00',
    '淨利（淨損）歸屬於母公司業主': '126188.00', '基本每股盈餘（元）': '2.85',
  }]);
  assert.equal(result.terminalReason, 'complete');
  assert.equal(result.facts.filter((fact) => fact.factKey === 'quarterly_gross_profit').length, 1);
  assert.equal(result.facts.find((fact) => fact.factKey === 'quarterly_net_income_attributable_to_common')?.value, 126188);
  assert.equal(result.facts.find((fact) => fact.factKey === 'quarterly_basic_eps')?.periodStart, '2026-01-01');
});
