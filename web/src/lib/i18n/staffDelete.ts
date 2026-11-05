export const deleteEn = {
  dlDelete: "Delete",
  dlDeleteForever: "Delete permanently",
  dlHallTitle: "Delete {name} permanently?",
  dlHallWarn:
    "This cannot be undone. The hall and ALL of its data are erased: devices, sessions, invoices, payments, wallets, shifts, expenses and its activity log, together with the accounts that belong only to this hall. Only a record that you deleted it is kept.",
  dlUserTitle: "Delete the account {name} permanently?",
  dlUserWarn:
    "This cannot be undone. The account and its sign-in are erased. Their name is removed from the activity log. Accounts that still appear in a hall's records, or owners whose hall still exists, cannot be deleted: deactivate them instead.",
};
export const deleteAr: Record<keyof typeof deleteEn, string> = {
  dlDelete: "حذف",
  dlDeleteForever: "حذف نهائي",
  dlHallTitle: "حذف {name} نهائياً؟",
  dlHallWarn:
    "لا يمكن التراجع. تُمحى الصالة وكل بياناتها: الأجهزة والجلسات والفواتير والدفعات والمحافظ والورديات والمصاريف وسجل النشاط، مع الحسابات التي تخص هذه الصالة فقط. لا يبقى إلا سجل بأنك حذفتها.",
  dlUserTitle: "حذف الحساب {name} نهائياً؟",
  dlUserWarn:
    "لا يمكن التراجع. يُمحى الحساب وبيانات دخوله ويُزال اسمه من سجل النشاط. لا يمكن حذف حساب ما زال مذكوراً في سجلات صالة، ولا حساب مالك صالته موجودة: عطّله بدلاً من ذلك.",
};
