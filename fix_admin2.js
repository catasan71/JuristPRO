import fs from 'fs';
let content = fs.readFileSync('src/components/admin-dashboard.component.ts', 'utf8');
content = content.replace(/<span class="bg-green-900\/30 text-green-400 px-2 py-1 rounded text-xs uppercase">Paid<\/span>\s*<\/td>/g, '<span class="bg-green-900/30 text-green-400 px-2 py-1 rounded text-xs uppercase">Paid</span>\n                                  </td>\n                                  <td class="px-6 py-4 text-right">\n                                     <button (click)="deleteTransaction(tx.id)" class="text-red-500 hover:text-red-400 text-xs hover:underline">Șterge</button>\n                                  </td>');
fs.writeFileSync('src/components/admin-dashboard.component.ts', content);
