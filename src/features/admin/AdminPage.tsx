import { useState } from 'react';
import { Page } from '@/components/shell/Page';
import { ScreenHeader, Segmented } from '@/components/ui';
import { PaymentsTab } from './PaymentsTab';
import { PlansTab } from './PlansTab';
import { UsersTab } from './UsersTab';

type Tab = 'payments' | 'users' | 'plans';

/** Admin console: payments to review, every account, and the plan catalogue. Authorised server-side. */
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('payments');
  return (
    <Page label="Quản trị">
      <ScreenHeader back="/profile" eyebrow="Quản trị viên" title="Quản trị" />
      <Segmented<Tab>
        ariaLabel="Mục quản trị"
        className="mt-5 lg:max-w-[520px]"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'payments', label: 'Thanh toán' },
          { value: 'users', label: 'Tài khoản' },
          { value: 'plans', label: 'Gói' },
        ]}
      />
      <div className="mt-5">
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'plans' && <PlansTab />}
      </div>
    </Page>
  );
}
