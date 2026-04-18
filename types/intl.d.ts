import type { AbstractIntlMessages } from 'next-intl';

declare global {
  interface IntlMessages extends AbstractIntlMessages {
    common: {
      login: string;
      logout: string;
      email: string;
      password: string;
      submit: string;
      cancel: string;
      save: string;
      delete: string;
      edit: string;
      search: string;
      loading: string;
      error: string;
      success: string;
    };
    nav: {
      halls: string;
      reservations: string;
      dashboard: string;
      admin: string;
      users: string;
    };
    auth: {
      welcomeBack: string;
      signIn: string;
      verifyOtp: string;
      enterCode: string;
    };
    halls: {
      title: string;
      available: string;
      busy: string;
      offline: string;
    };
    reservations: {
      title: string;
      new: string;
      pending: string;
      confirmed: string;
      cancelled: string;
    };
  }
}
