/** Thông tin nhận chuyển khoản nâng cấp gói (công khai, hiển thị cho người mua). */
export const BANK = {
  code: 'MB',
  name: 'MB Bank',
  account: '0399045920',
  /** Nội dung chuyển khoản gợi ý. */
  memo: 'FITORA PRO',
  supportPhone: '0399045920',
  supportEmail: 'nguyenngoctuyen11032003@gmail.com',
} as const;

/** VietQR image (img.vietqr.io) with the amount and memo pre-filled. */
export function vietQrUrl(amountVnd: number, memo: string = BANK.memo): string {
  const q = new URLSearchParams();
  if (amountVnd > 0) q.set('amount', String(Math.round(amountVnd)));
  q.set('addInfo', memo);
  return `https://img.vietqr.io/image/${BANK.code}-${BANK.account}-compact2.png?${q.toString()}`;
}

export const formatVnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(n)}đ`;
