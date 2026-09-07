import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "./supabaseClient";
import {
  Bell,
  QrCode,
  Users,
  TrendingUp,
  Wallet,
  LogOut,
  Settings,
  Award,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Search,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

/* =========================================================
   TYPES
========================================================= */
type BusinessType = "Coffee" | "Restaurant" | "Beauty" | "Retail" | "Fitness";
type TransactionType = "income" | "expense";
type ClientStatus = "Обычный" | "Активный" | "VIP";
type CampaignStatus = "Активна" | "Завершена";

interface BusinessUser {
  id: string;
  ownerName: string;
  companyName: string;
  businessType: BusinessType;
  email: string;
  phone: string;
  qrToken: string;
  cashbackRate: number;
  role: "admin" | "business";
}

interface Client {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email: string | null;
  status: ClientStatus;
  purchasesCount: number;
  totalSpent: number;
  bonusesBalance: number;
  lastPurchaseDate: string | null;
  createdAt: string;
}

interface Transaction {
  id: string;
  companyId: string;
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  description: string;
}

interface Campaign {
  id: string;
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  budget: number;
  expectedRevenue: number;
  status: CampaignStatus;
  expectedGrowth: string;
  expectedProfit: string;
}

interface BusinessNotification {
  id: string;
  companyId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

type Page =
  | "dashboard"
  | "clients"
  | "finances"
  | "campaigns"
  | "analytics"
  | "profile"
  | "qr"
  | "notifications";

/* =========================================================
   HELPERS
========================================================= */
function money(value: number) {
  return Number(value || 0).toLocaleString("ru-RU") + " ₸";
}

function dateNow() {
  return new Date().toISOString().slice(0, 10);
}

function clientStatus(purchases: number, spent: number): ClientStatus {
  if (purchases >= 6 || spent >= 100000) {
    return "VIP";
  }
  if (purchases >= 2) {
    return "Активный";
  }
  return "Обычный";
}

/* =========================================================
   DATABASE MAPPERS
========================================================= */
function mapUser(row: any): BusinessUser {
  return {
    id: row.id,
    ownerName: row.owner_name || "",
    companyName: row.company_name || "",
    businessType: row.business_type || "Coffee",
    email: row.email || "",
    phone: row.phone || "",
    qrToken: row.qr_token || "",
    cashbackRate: Number(row.cashback_rate ?? 5),
    role: row.role === "admin" ? "admin" : "business",
  };
}

function mapClient(row: any): Client {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name || "",
    phone: row.phone || "",
    email: row.email || null,
    status: row.status || "Обычный",
    purchasesCount: Number(row.purchases_count || 0),
    totalSpent: Number(row.total_spent || 0),
    bonusesBalance: Number(row.bonuses_balance || 0),
    lastPurchaseDate: row.last_purchase_date || null,
    createdAt: row.created_at || dateNow(),
  };
}

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    companyId: row.company_id,
    type: row.type,
    amount: Number(row.amount || 0),
    category: row.category || "",
    date: row.date || dateNow(),
    description: row.description || "",
  };
}

function mapCampaign(row: any): Campaign {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name || "",
    startDate: row.start_date || dateNow(),
    endDate: row.end_date || dateNow(),
    budget: Number(row.budget || 0),
    expectedRevenue: Number(row.expected_revenue || 0),
    status: row.status || "Активна",
    expectedGrowth: row.expected_growth || "+18%",
    expectedProfit: row.expected_profit || "+40 000 ₸",
  };
}

function mapBusinessNotification(row: any): BusinessNotification {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title || "Уведомление",
    message: row.message || "",
    isRead: !!row.is_read,
    createdAt: row.created_at || dateNow(),
  };
}

/* =========================================================
   MAIN APP
========================================================= */
export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<BusinessUser | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [businessNotifications, setBusinessNotifications] = useState<
    BusinessNotification[]
  >([]);
  const [page, setPage] = useState<Page>("dashboard");
  const [error, setError] = useState("");
  const [qrClientMode, setQrClientMode] = useState(false);
  const [qrCompanyId, setQrCompanyId] = useState("");
  const [qrToken, setQrToken] = useState("");

  // Explicit toggle to allow business users to login without being hijacked by client storage
  const [viewMode, setViewMode] = useState<"business" | "client">("business");
  const [publicClientId, setPublicClientId] = useState<string | null>(
    localStorage.getItem("bg_client_id_v5")
  );
  const [clientAuthMode, setClientAuthMode] = useState<"login" | "register">(
    "register"
  );
  const [onboardingStep, setOnboardingStep] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const clientCompany = params.get("company");
      const clientQr = params.get("qr");

      if (clientQr) {
        if (mounted) {
          setQrClientMode(true);
          setQrCompanyId(clientCompany || "");
          setQrToken(clientQr);
          setViewMode("client");
          setAuthLoading(false);
        }
        return;
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      setSession(currentSession);

      if (currentSession?.user) {
        setViewMode("business");
        await loadBusiness(currentSession.user.id);
      }
      setAuthLoading(false);
    }
    init();

    const {
      data: { subscription },
    supabase.auth.onAuthStateChange(async (_event: any, nextSession: any) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession?.user) {
        setViewMode("business");
        await loadBusiness(nextSession.user.id);
      } else {
        setUser(null);
        setClients([]);
        setTransactions([]);
        setCampaigns([]);
        setBusinessNotifications([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadBusiness(userId: string) {
    setError("");
    const { data, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError) {
      setError("Ошибка загрузки профиля: " + userError.message);
      return;
    }
    if (!data) {
      setError("Профиль не найден.");
      return;
    }

    const business = mapUser(data);
    setUser(business);

    if (business.role === "admin") {
      setPage("dashboard");
      return;
    }

    await loadData(business.id);
  }

  async function loadData(companyId: string) {
    const [clientsResult, transactionsResult, campaignsResult, notifsResult] =
      await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("*")
          .eq("company_id", companyId)
          .order("date", { ascending: false }),
        supabase
          .from("campaigns")
          .select("*")
          .eq("company_id", companyId)
          .order("start_date", { ascending: false }),
        supabase
          .from("business_notifications")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
      ]);

    if (clientsResult.error) {
      setError("Ошибка клиентов: " + clientsResult.error.message);
    } else {
      setClients((clientsResult.data || []).map(mapClient));
    }

    if (transactionsResult.error) {
      setError("Ошибка транзакций: " + transactionsResult.error.message);
    } else {
      setTransactions((transactionsResult.data || []).map(mapTransaction));
    }

    if (campaignsResult.error) {
      setError("Ошибка кампаний: " + campaignsResult.error.message);
    } else {
      setCampaigns((campaignsResult.data || []).map(mapCampaign));
    }

    if (!notifsResult.error) {
      setBusinessNotifications(
        (notifsResult.data || []).map(mapBusinessNotification)
      );
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setClients([]);
    setTransactions([]);
    setCampaigns([]);
    setBusinessNotifications([]);
    setViewMode("business");
  }

  async function updateUser(updated: BusinessUser) {
    if (!user) return;
    const { error: updateError } = await supabase
      .from("users")
      .update({
        owner_name: updated.ownerName,
        company_name: updated.companyName,
        business_type: updated.businessType,
        email: updated.email,
        phone: updated.phone,
        cashback_rate: updated.cashbackRate,
      })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setUser(updated);
  }

  async function addTransaction(data: Omit<Transaction, "id" | "companyId">) {
    if (!user) return;
    const { data: row, error: insertError } = await supabase
      .from("transactions")
      .insert({
        company_id: user.id,
        type: data.type,
        amount: data.amount,
        category: data.category,
        date: data.date,
        description: data.description,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (row) {
      setTransactions((prev) => [mapTransaction(row), ...prev]);
    }
  }

  async function updateTransaction(t: Transaction) {
    const { data, error: updateError } = await supabase
      .from("transactions")
      .update({
        type: t.type,
        amount: t.amount,
        category: t.category,
        date: t.date,
        description: t.description,
      })
      .eq("id", t.id)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (data) {
      setTransactions((prev) =>
        prev.map((item) => (item.id === t.id ? mapTransaction(data) : item))
      );
    }
  }

  async function deleteTransaction(id: string) {
    const { error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTransactions((prev) => prev.filter((item) => item.id !== id));
  }

  async function addCampaign(data: Omit<Campaign, "id" | "companyId">) {
    if (!user) return;
    const { data: row, error: insertError } = await supabase
      .from("campaigns")
      .insert({
        company_id: user.id,
        name: data.name,
        start_date: data.startDate,
        end_date: data.endDate,
        budget: data.budget,
        expected_revenue: data.expectedRevenue,
        status: data.status,
        expected_growth: data.expectedGrowth,
        expected_profit: data.expectedProfit,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (row) {
      const newCamp = mapCampaign(row);
      setCampaigns((prev) => [newCamp, ...prev]);
      try {
        const { data: compClients } = await supabase
          .from("clients")
          .select("id")
          .eq("company_id", user.id);
        if (compClients && compClients.length > 0) {
          const notifsToInsert = compClients.map((cl: any) => ({
            client_id: cl.id,
            company_id: user.id,
            company_name: user.companyName,
            title: "Новая акция!",
            message: `Скидка в рамках "${newCamp.name}". Не пропустите!`,
            is_read: false,
          }));
          await supabase.from("notifications").insert(notifsToInsert);
        }
      } catch (e) {
        console.error("Failed to notify clients about campaign", e);
      }
    }
  }

  async function updateCampaign(c: Campaign) {
    const { data, error: updateError } = await supabase
      .from("campaigns")
      .update({
        name: c.name,
        start_date: c.startDate,
        end_date: c.endDate,
        budget: c.budget,
        expected_revenue: c.expectedRevenue,
        status: c.status,
        expected_growth: c.expectedGrowth,
        expected_profit: c.expectedProfit,
      })
      .eq("id", c.id)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (data) {
      setCampaigns((prev) =>
        prev.map((item) => (item.id === c.id ? mapCampaign(data) : item))
      );
    }
  }

  async function deleteCampaign(id: string) {
    const { error: deleteError } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setCampaigns((prev) => prev.filter((item) => item.id !== id));
  }

  async function addClient(data: {
    name: string;
    phone: string;
    email: string;
  }) {
    if (!user) return;
    const { data: row, error: insertError } = await supabase
      .from("clients")
      .insert({
        company_id: user.id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        status: "Обычный",
        purchases_count: 0,
        total_spent: 0,
        bonuses_balance: 0,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (row) {
      setClients((prev) => [mapClient(row), ...prev]);
    }
  }

  async function deleteClient(id: string) {
    const { error: deleteError } = await supabase
      .from("clients")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setClients((prev) => prev.filter((item) => item.id !== id));
  }

  async function addPurchase(
    client: Client,
    amount: number,
    cashbackRate: number
  ) {
    if (!user || amount <= 0) return;
    const { data, error: purchaseError } = await supabase.rpc(
      "record_client_purchase",
      {
        p_client_id: client.id,
        p_company_id: user.id,
        p_amount: amount,
        p_cashback_rate: cashbackRate,
      }
    );

    if (purchaseError) {
      setError(purchaseError.message);
      return;
    }
    if (data?.client) {
      setClients((prev) =>
        prev.map((item) =>
          item.id === client.id ? mapClient(data.client) : item
        )
      );
    }
    if (data?.transaction) {
      setTransactions((prev) => [mapTransaction(data.transaction), ...prev]);
    }
  }

  async function deductBonuses(client: Client, deductionAmount: number) {
    if (!user || deductionAmount <= 0) return;
    if (deductionAmount > client.bonusesBalance) {
      setError("Недостаточно бонусов.");
      return;
    }
    const newBalance = client.bonusesBalance - deductionAmount;
    const { data, error: updateErr } = await supabase
      .from("clients")
      .update({ bonuses_balance: newBalance })
      .eq("id", client.id)
      .select()
      .single();

    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    if (data) {
      setClients((prev) =>
        prev.map((item) => (item.id === client.id ? mapClient(data) : item))
      );
    }
  }

  async function markBusinessNotificationRead(id: string) {
    await supabase
      .from("business_notifications")
      .update({ is_read: true })
      .eq("id", id);
    setBusinessNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }

  if (authLoading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingCard}>
          <div style={styles.logoCircle}>BG</div>
          <h2>BusinessGrowth</h2>
          <p>Загрузка приложения...</p>
        </div>
      </div>
    );
  }

  if (qrClientMode) {
    return (
      <ClientQRRegistration
        companyId={qrCompanyId}
        qrToken={qrToken}
        onJoined={(id) => {
          localStorage.setItem("bg_client_id_v5", id);
          setPublicClientId(id);
          setQrClientMode(false);
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }

  // Strict prioritization: Business users with an active session go to dashboard,
  // NOT automatically intercepted by stale client local storage unless viewMode is explicitly "client".
  if (!session && publicClientId && viewMode === "client") {
    return (
      <PublicClientPortal
        clientId={publicClientId}
        onLogout={() => {
          localStorage.removeItem("bg_client_id_v5");
          setPublicClientId(null);
          setViewMode("business");
        }}
      />
    );
  }

  if (!session && viewMode === "client" && !publicClientId) {
    return (
      <ClientAuthWrapper
        publicClientId={publicClientId}
        setPublicClientId={(id) => {
          setPublicClientId(id);
          if (id) setViewMode("client");
        }}
        clientAuthMode={clientAuthMode}
        setClientAuthMode={setClientAuthMode}
        onError={setError}
        error={error}
      />
    );
  }

  if (!session || !user) {
    return (
      <div>
        <div style={{ position: "fixed", top: 15, right: 15, zIndex: 9999 }}>
          <button
            style={styles.secondaryButton}
            onClick={() =>
              setViewMode(viewMode === "business" ? "client" : "business")
            }
          >
            {viewMode === "business"
              ? "👤 Войти как клиент"
              : "🏢 Войти как бизнес"}
          </button>
        </div>
        {viewMode === "client" ? (
          <ClientAuthWrapper
            publicClientId={publicClientId}
            setPublicClientId={(id) => {
              setPublicClientId(id);
              if (id) setViewMode("client");
            }}
            clientAuthMode={clientAuthMode}
            setClientAuthMode={setClientAuthMode}
            onError={setError}
            error={error}
          />
        ) : (
          <AuthScreen onError={setError} error={error} />
        )}
      </div>
    );
  }

  if (user.role === "admin") {
    return <AdminPanel profile={user} onLogout={logout} />;
  }

  if (onboardingStep > 0) {
    return (
      <OnboardingWizard
        step={onboardingStep}
        setStep={setOnboardingStep}
        onFinish={() => setOnboardingStep(0)}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      page={page}
      setPage={setPage}
      clients={clients}
      transactions={transactions}
      campaigns={campaigns}
      businessNotifications={businessNotifications}
      error={error}
      onClearError={() => setError("")}
      onLogout={logout}
      onUpdateUser={updateUser}
      onAddClient={addClient}
      onDeleteClient={deleteClient}
      onAddPurchase={addPurchase}
      onDeductBonuses={deductBonuses}
      onAddTransaction={addTransaction}
      onUpdateTransaction={updateTransaction}
      onDeleteTransaction={deleteTransaction}
      onAddCampaign={addCampaign}
      onUpdateCampaign={updateCampaign}
      onDeleteCampaign={deleteCampaign}
      onMarkBusinessNotificationRead={markBusinessNotificationRead}
      onStartOnboarding={() => setOnboardingStep(1)}
    />
  );
}

/* =========================================================
   ONBOARDING WIZARD
========================================================= */
function OnboardingWizard({
  step,
  setStep,
  onFinish,
}: {
  step: number;
  setStep: (s: number) => void;
  onFinish: () => void;
}) {
  const steps = [
    {
      title: "Шаг 1: Создайте аккаунт бизнеса",
      desc: "Зарегистрируйте компанию в системе BusinessGrowth.",
      icon: "🏢",
    },
    {
      title: "Шаг 2: Настройте программу лояльности",
      desc: "Укажите процент кэшбэка и параметры бонусов.",
      icon: "⚙️",
    },
    {
      title: "Шаг 3: Поделитесь QR-кодом",
      desc: "Разместите QR-код на кассе для привлечения клиентов.",
      icon: "📱",
    },
    {
      title: "Шаг 4: Отслеживайте рост и аналитику",
      desc: "Используйте встроенную CRM и аналитику для увеличения продаж.",
      icon: "📈",
    },
  ];
  const current = steps[step - 1] || steps[0];
  return (
    <div style={styles.authPage}>
      <div style={styles.authContainer}>
        <div style={styles.authBrand}>
          <div style={styles.logoCircle}>BG</div>
          <div>
            <div style={styles.brandTitle}>BusinessGrowth</div>
            <div style={styles.brandSubtitle}>Быстрый старт</div>
          </div>
        </div>
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <div style={{ fontSize: "50px", marginBottom: "15px" }}>
            {current.icon}
          </div>
          <h2 style={{ fontSize: "22px", marginBottom: "10px" }}>
            {current.title}
          </h2>
          <p style={styles.muted}>{current.desc}</p>
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "30px" }}>
          {step > 1 && (
            <button
              style={styles.secondaryButton}
              onClick={() => setStep(step - 1)}
            >
              Назад
            </button>
          )}
          {step < steps.length ? (
            <button
              style={{ ...styles.primaryButtonFull, flex: 1, marginTop: 0 }}
              onClick={() => setStep(step + 1)}
            >
              Далее
            </button>
          ) : (
            <button
              style={{ ...styles.primaryButtonFull, flex: 1, marginTop: 0 }}
              onClick={onFinish}
            >
              Завершить
            </button>
          )}
        </div>
        <button
          style={{
            background: "none",
            border: "none",
            color: "#6B7280",
            width: "100%",
            marginTop: "15px",
            cursor: "pointer",
            fontSize: "13px",
          }}
          onClick={onFinish}
        >
          Пропустить обучение
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   CLIENT AUTH WRAPPER
========================================================= */
function ClientAuthWrapper({
  publicClientId,
  setPublicClientId,
  clientAuthMode,
  setClientAuthMode,
  onError,
  error,
}: {
  publicClientId: string | null;
  setPublicClientId: (id: string | null) => void;
  clientAuthMode: "login" | "register";
  setClientAuthMode: (mode: "login" | "register") => void;
  onError: (msg: string) => void;
  error: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleClientAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError("");
    setMessage("");
    try {
      if (clientAuthMode === "register") {
        const { data, error: regErr } = await supabase.rpc(
          "register_client_account",
          {
            p_email: email.trim(),
            p_password: password,
            p_name: name.trim(),
            p_phone: phone.trim(),
          }
        );
        if (regErr) {
          throw regErr;
        }
        if (data?.client_id) {
          localStorage.setItem("bg_client_id_v5", data.client_id);
          setPublicClientId(data.client_id);
        }
      } else {
        const { data, error: logErr } = await supabase.rpc(
          "login_client_account",
          {
            p_email: email.trim(),
            p_password: password,
          }
        );
        if (logErr) throw logErr;
        if (data?.client_id) {
          localStorage.setItem("bg_client_id_v5", data.client_id);
          setPublicClientId(data.client_id);
        } else {
          onError("Неверный email или пароль.");
        }
      }
    } catch (err: any) {
      try {
        if (clientAuthMode === "login") {
          const { data: foundClient, error: searchErr } = await supabase
            .from("clients")
            .select("id")
            .eq("email", email.trim())
            .single();
          if (searchErr || !foundClient) {
            onError("Неверный email или пароль.");
          } else {
            localStorage.setItem("bg_client_id_v5", foundClient.id);
            setPublicClientId(foundClient.id);
          }
        } else {
          const { data: newCl, error: insErr } = await supabase
            .from("clients")
            .insert({
              name: name.trim() || "Клиент",
              phone: phone.trim() || "+77770000000",
              email: email.trim(),
              status: "Обычный",
              purchases_count: 0,
              total_spent: 0,
              bonuses_balance: 0,
            })
            .select()
            .single();
          if (insErr) throw insErr;
          if (newCl) {
            localStorage.setItem("bg_client_id_v5", newCl.id);
            setPublicClientId(newCl.id);
          }
        }
      } catch (fallbackErr: any) {
        onError(
          fallbackErr?.message || err?.message || "Ошибка авторизации клиента."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.authPage}>
      <div style={styles.authContainer}>
        <div style={styles.authBrand}>
          <div style={styles.logoCircle}>BG</div>
          <div>
            <div style={styles.brandTitle}>BusinessGrowth</div>
            <div style={styles.brandSubtitle}>Портал клиента</div>
          </div>
        </div>
        <div style={styles.authTabs}>
          <button
            style={
              clientAuthMode === "login" ? styles.authTabActive : styles.authTab
            }
            onClick={() => setClientAuthMode("login")}
          >
            Вход
          </button>
          <button
            style={
              clientAuthMode === "register"
                ? styles.authTabActive
                : styles.authTab
            }
            onClick={() => setClientAuthMode("register")}
          >
            Регистрация
          </button>
        </div>
        <form style={styles.authForm} onSubmit={handleClientAuth}>
          <h1 style={styles.authTitle}>
            {clientAuthMode === "login"
              ? "Вход для клиента"
              : "Регистрация клиента"}
          </h1>
          {error && <div style={styles.errorBox}>{error}</div>}
          {message && <div style={styles.successBox}>{message}</div>}
          {clientAuthMode === "register" && (
            <>
              <Input
                label="Имя"
                value={name}
                onChange={setName}
                placeholder="Иван"
              />
              <Input
                label="Телефон"
                value={phone}
                onChange={setPhone}
                placeholder="+7 777 000 00 00"
              />
            </>
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="client@example.com"
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />
          <button
            type="submit"
            style={styles.primaryButtonFull}
            disabled={loading}
          >
            {loading.toString().includes("true") // simple check
              ? "Загрузка..."
              : clientAuthMode === "login"
              ? "Войти"
              : "Зарегистрироваться"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   AUTH
========================================================= */
function AuthScreen({
  onError,
  error,
}: {
  onError: (message: string) => void;
  error: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [ownerName, setOwnerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("Coffee");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError("");
    setMessage("");
    try {
      if (mode === "login") {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) {
          throw loginError;
        }
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            owner_name: ownerName,
            company_name: companyName,
            business_type: businessType,
            phone,
            cashback_rate: 5,
          },
        },
      });
      if (signUpError) {
        throw signUpError;
      }
      setMessage("Регистрация успешна. Проверьте почту или войдите.");
      setMode("login");
    } catch (err: any) {
      onError(err?.message || "Ошибка авторизации.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.authPage}>
      <div style={styles.authContainer}>
        <div style={styles.authBrand}>
          <div style={styles.logoCircle}>BG</div>
          <div>
            <div style={styles.brandTitle}>BusinessGrowth</div>
            <div style={styles.brandSubtitle}>Кабинет предпринимателя</div>
          </div>
        </div>
        <div style={styles.authTabs}>
          <button
            style={mode === "login" ? styles.authTabActive : styles.authTab}
            onClick={() => setMode("login")}
          >
            Вход
          </button>
          <button
            style={mode === "register" ? styles.authTabActive : styles.authTab}
            onClick={() => setMode("register")}
          >
            Регистрация
          </button>
        </div>
        <form style={styles.authForm} onSubmit={submit}>
          <h1 style={styles.authTitle}>
            {mode === "login" ? "Вход для бизнеса" : "Регистрация бизнеса"}
          </h1>
          {error && <div style={styles.errorBox}>{error}</div>}
          {message && <div style={styles.successBox}>{message}</div>}
          {mode === "register" && (
            <>
              <Input
                label="Имя владельца"
                value={ownerName}
                onChange={setOwnerName}
                placeholder="Иван"
              />
              <Input
                label="Название компании"
                value={companyName}
                onChange={setCompanyName}
                placeholder="Например: Coffee House"
              />
              <div style={styles.inputGroup}>
                <label style={styles.label}>Тип бизнеса</label>
                <select
                  style={styles.input}
                  value={businessType}
                  onChange={(e) =>
                    setBusinessType(e.target.value as BusinessType)
                  }
                >
                  <option value="Coffee">Coffee</option>
                  <option value="Restaurant">Restaurant</option>
                  <option value="Beauty">Beauty</option>
                  <option value="Retail">Retail</option>
                  <option value="Fitness">Fitness</option>
                </select>
              </div>
              <Input
                label="Телефон"
                value={phone}
                onChange={setPhone}
                placeholder="+7 777 000 00 00"
              />
            </>
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="business@example.com"
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />
          <button
            type="submit"
            style={styles.primaryButtonFull}
            disabled={loading}
          >
            {loading
              ? "Загрузка..."
              : mode === "login"
              ? "Войти"
              : "Зарегистрировать бизнес"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   INPUT
========================================================= */
function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>{label}</label>
      <input
        style={styles.input}
        type={type}
        required
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* =========================================================
   CLIENT QR REGISTRATION
========================================================= */
function ClientQRRegistration({
  companyId,
  qrToken,
  onJoined,
}: {
  companyId: string;
  qrToken: string;
  onJoined: (id: string) => void;
}) {
  const [company, setCompany] = useState<any>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_company_by_qr", {
        p_qr_token: qrToken,
      });
      if (error) setError(error.message);
      else setCompany(data || null);
    })();
  }, [qrToken]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { data, error } = await supabase.rpc("join_company_by_qr", {
      p_qr_token: qrToken,
      p_client_id: null,
      p_name: name.trim(),
      p_phone: phone.trim(),
    });
    if (error) {
      try {
        const { data: insData, error: insErr } = await supabase
          .from("clients")
          .insert({
            company_id: company?.id || companyId,
            name: name.trim(),
            phone: phone.trim(),
            status: "Обычный",
            purchases_count: 0,
            total_spent: 0,
            bonuses_balance: 0,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        if (insData) {
          onJoined(insData.id);
          return;
        }
      } catch (err: any) {
        setError(err.message || error.message);
        setSaving(false);
        return;
      }
    }
    const id = data?.client_id;
    if (!id) {
      setError("Ошибка присоединения.");
      setSaving(false);
      return;
    }
    onJoined(id);
  }

  return (
    <div style={styles.clientPage}>
      <div style={styles.clientCard}>
        <div style={styles.logoCircle}>BG</div>
        <div style={styles.brandTitle}>BusinessGrowth</div>
        <div style={styles.brandSubtitle}>Регистрация по QR</div>
        <div style={{ marginTop: 28 }}>
          <div style={styles.infoBox}>
            <div>Компания:</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
              {company?.company_name || "Загрузка компании..."}
            </div>
            {company?.cashback_rate != null && (
              <div style={{ marginTop: 8 }}>
                Кэшбэк: <b>{company.cashback_rate}%</b>
              </div>
            )}
          </div>
        </div>
        <form onSubmit={join}>
          <Input
            label="Ваше имя"
            value={name}
            onChange={setName}
            placeholder="Иван"
          />
          <Input
            label="Телефон"
            value={phone}
            onChange={setPhone}
            placeholder="+7 777 000 00 00"
          />
          {error && <div style={styles.errorBox}>{error}</div>}
          <button
            type="submit"
            style={styles.primaryButtonFull}
            disabled={saving || !company}
          >
            {saving ? "Сохранение..." : "Присоединиться к программе"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   PUBLIC CLIENT PORTAL
========================================================= */
function PublicClientPortal({
  clientId,
  onLogout,
}: {
  clientId: string;
  onLogout: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: result, error } = await supabase.rpc("get_client_portal", {
      p_client_id: clientId,
    });
    if (!error && result) {
      setData(result);
    } else {
      const { data: clData } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      const { data: mData } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId);
      setData({ client: clData, memberships: mData || [], notifications: [] });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [clientId]);

  if (loading) {
    return <div style={styles.loadingScreen}>Загрузка портала...</div>;
  }

  if (!data?.client) {
    return (
      <div style={styles.clientPage}>
        <div style={styles.clientCard}>
          <div style={styles.logoCircle}>BG</div>
          <h2>Клиент не найден</h2>
          <p style={styles.clientSubtitle}>
            Попробуйте зайти заново через QR-код компании.
          </p>
          <button style={styles.primaryButtonFull} onClick={onLogout}>
            Выйти
          </button>
        </div>
      </div>
    );
  }

  const memberships = data.memberships || [];
  const notifications = data.notifications || [];
  const unread = notifications.filter((n: any) => !n.is_read).length;

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    load();
  }

  return (
    <div style={styles.clientPage}>
      <div style={{ width: "min(1080px, 94vw)" }}>
        <div style={styles.clientPortalHeader}>
          <div style={styles.authBrand}>
            <div style={styles.logoCircle}>BG</div>
            <div>
              <div style={styles.brandTitle}>BusinessGrowth</div>
              <div style={styles.brandSubtitle}>Клиентский портал</div>
            </div>
          </div>
          <button style={styles.secondaryButton} onClick={onLogout}>
            Выйти
          </button>
        </div>
        <div style={styles.clientHero}>
          <div>
            <div style={styles.clientHeroEyebrow}>
              ПРОГРАММА ЛОЯЛЬНОСТИ BUSINESSGROWTH
            </div>
            <h1 style={styles.clientHeroTitle}>
              Добро пожаловать, {data.client.name}!
            </h1>
            <p style={styles.clientHeroText}>
              Ваши накопленные бонусы и активные статусы в бизнесах.
            </p>
          </div>
          <div style={styles.clientHeroBadge}>
            <Bell size={24} />
            <b>{unread}</b>
            <span>уведомлений</span>
          </div>
        </div>
        <div style={styles.clientPortalGrid}>
          <div>
            <div style={styles.portalSectionTitle}>
              <h2>Ваши программы лояльности</h2>
              <span>{memberships.length}</span>
            </div>
            {memberships.length === 0 ? (
              <div style={styles.card}>
                <p style={styles.muted}>Нет активных программ.</p>
              </div>
            ) : (
              memberships.map((m: any) => (
                <div key={m.id} style={styles.membershipCard}>
                  <div style={styles.membershipTop}>
                    <div style={styles.membershipLogo}>
                      {(m.company?.company_name || m.name || "B")[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0 }}>
                        {m.company?.company_name || "Компания"}
                      </h3>
                      <span style={styles.smallText}>
                        {m.company?.business_type || "Бизнес"}
                      </span>
                    </div>
                    <span style={styles.membershipCashback}>
                      Кэшбэк {m.company?.cashback_rate || 5}%
                    </span>
                  </div>
                  <div style={styles.membershipStats}>
                    <div>
                      <b>
                        {money(
                          m.bonuses_balance ?? data.client.bonuses_balance
                        )}
                      </b>
                      <small>Бонусы</small>
                    </div>
                    <div>
                      <b>
                        {m.purchases_count ?? data.client.purchases_count ?? 0}
                      </b>
                      <small>Покупки</small>
                    </div>
                    <div>
                      <b>{money(m.total_spent ?? data.client.total_spent)}</b>
                      <small>Потрачено</small>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div>
            <div style={styles.portalSectionTitle}>
              <h2>Уведомления</h2>
              <span>{unread}</span>
            </div>
            <div style={styles.notificationsList}>
              {notifications.length === 0 ? (
                <div style={styles.card}>
                  <p style={styles.muted}>Новых уведомлений пока нет.</p>
                </div>
              ) : (
                notifications.map((n: any) => (
                  <button
                    key={n.id}
                    style={{
                      ...styles.notificationCard,
                      opacity: n.is_read ? 0.65 : 1,
                    }}
                    onClick={() => markRead(n.id)}
                  >
                    <div style={styles.notificationIcon}>
                      <Bell size={18} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <b>{n.title || "Уведомление"}</b>
                      <p>{n.message}</p>
                      <small>
                        {n.company_name || "BusinessGrowth"} •{" "}
                        {n.created_at
                          ? new Date(n.created_at).toLocaleDateString("ru-RU")
                          : ""}
                      </small>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN CONTROL
========================================================= */
function AdminPanel({
  profile,
  onLogout,
}: {
  profile: BusinessUser;
  onLogout: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data: result, error: rpcError } = await supabase.rpc(
      "get_admin_overview"
    );
    if (rpcError) {
      const { data: bList } = await supabase.from("users").select("*");
      const { data: cList } = await supabase.from("clients").select("*");
      const { data: tList } = await supabase.from("transactions").select("*");
      const { data: campList } = await supabase.from("campaigns").select("*");
      setData({
        businesses: bList || [],
        clients: cList || [],
        memberships: cList || [],
        transactions: tList || [],
        campaigns: campList || [],
      });
    } else {
      setData(result);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div style={styles.loadingScreen}>Загрузка Admin Control...</div>;
  }

  const businesses = data?.businesses || [];
  const clients = data?.clients || [];
  const memberships = data?.memberships || [];
  const transactions = data?.transactions || [];

  const filtered = businesses.filter((b: any) =>
    `${b.company_name} ${b.owner_name} ${b.email} ${b.business_type}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const income = transactions
    .filter((t: any) => t.type === "income")
    .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

  return (
    <div style={styles.adminPage}>
      <aside style={styles.adminSidebar}>
        <div style={styles.sidebarLogo}>
          <div style={styles.smallLogo}>BG</div>
          <div>
            <b>BusinessGrowth</b>
            <div style={styles.sidebarCompany}>ADMIN CONTROL</div>
          </div>
        </div>
        <div style={styles.adminBadge}>
          <span>Администратор</span>
        </div>
        <div style={{ flex: 1 }} />
        <button style={styles.logoutButton} onClick={onLogout}>
          Выйти
        </button>
      </aside>
      <main style={styles.adminMain}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>Admin Control</h1>
            <p style={styles.pageSubtitle}>Общая статистика платформы</p>
          </div>
          <div style={styles.headerUser}>{profile.email}</div>
        </header>
        <section style={styles.content}>
          {error && <div style={styles.errorTop}>{error}</div>}
          <div style={styles.statsGrid}>
            <Stat
              title="Всего бизнесов"
              value={String(businesses.length)}
              icon="🏢"
            />
            <Stat
              title="Всего клиентов"
              value={String(clients.length)}
              icon="👤"
            />
            <Stat
              title="Участий (Memberships)"
              value={String(memberships.length)}
              icon="🔗"
            />
            <Stat title="Оборот" value={money(income)} icon="💰" />
          </div>
          <div style={styles.card}>
            <div style={styles.toolbar}>
              <div>
                <h2 style={styles.cardTitle}>Бизнесы</h2>
                <p style={styles.muted}>
                  Список всех зарегистрированных компаний
                </p>
              </div>
              <input
                style={styles.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск бизнеса..."
              />
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Компания</th>
                    <th style={styles.th}>Владелец</th>
                    <th style={styles.th}>Тип</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Роль</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b: any) => (
                    <tr key={b.id}>
                      <td style={styles.td}>
                        <b>{b.company_name}</b>
                      </td>
                      <td style={styles.td}>{b.owner_name}</td>
                      <td style={styles.td}>{b.business_type}</td>
                      <td style={styles.td}>{b.email}</td>
                      <td style={styles.td}>
                        <span style={styles.badge}>{b.role || "business"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */
function Dashboard({
  user,
  page,
  setPage,
  clients,
  transactions,
  campaigns,
  businessNotifications,
  error,
  onClearError,
  onLogout,
  onUpdateUser,
  onAddClient,
  onDeleteClient,
  onAddPurchase,
  onDeductBonuses,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddCampaign,
  onUpdateCampaign,
  onDeleteCampaign,
  onMarkBusinessNotificationRead,
  onStartOnboarding,
}: {
  user: BusinessUser;
  page: Page;
  setPage: (p: Page) => void;
  clients: Client[];
  transactions: Transaction[];
  campaigns: Campaign[];
  businessNotifications: BusinessNotification[];
  error: string;
  onClearError: () => void;
  onLogout: () => void;
  onUpdateUser: (u: BusinessUser) => void;
  onAddClient: (data: { name: string; phone: string; email: string }) => void;
  onDeleteClient: (id: string) => void;
  onAddPurchase: (client: Client, amount: number, cashbackRate: number) => void;
  onDeductBonuses: (client: Client, amount: number) => void;
  onAddTransaction: (data: Omit<Transaction, "id" | "companyId">) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onAddCampaign: (data: Omit<Campaign, "id" | "companyId">) => void;
  onUpdateCampaign: (c: Campaign) => void;
  onDeleteCampaign: (id: string) => void;
  onMarkBusinessNotificationRead: (id: string) => void;
  onStartOnboarding: () => void;
}) {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const activeCampaigns = campaigns.filter(
    (c) => c.status === "Активна"
  ).length;
  const unreadNotifsCount = businessNotifications.filter(
    (n) => !n.isRead
  ).length;

  const menu: {
    id: Page;
    title: string;
    icon: string;
  }[] = [
    { id: "dashboard", title: "Главная", icon: "📊" },
    { id: "clients", title: "Клиенты & CRM", icon: "👥" },
    { id: "finances", title: "Финансы", icon: "💰" },
    { id: "campaigns", title: "Кампании", icon: "🚀" },
    { id: "analytics", title: "AI-Аналитика", icon: "🤖" },
    { id: "qr", title: "QR-код", icon: "📱" },
    { id: "notifications", title: "Уведомления", icon: "🔔" },
    { id: "profile", title: "Профиль", icon: "⚙️" },
  ];

  return (
    <div style={styles.dashboard}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <div style={styles.smallLogo}>BG</div>
          <div>
            <b>BusinessGrowth</b>
            <div style={styles.sidebarCompany}>{user.companyName}</div>
          </div>
        </div>
        <div style={styles.sidebarMenu}>
          {menu.map((item) => (
            <button
              key={item.id}
              style={page === item.id ? styles.menuActive : styles.menuItem}
              onClick={() => setPage(item.id)}
            >
              <span>
                {item.icon} {item.title}
              </span>
              {item.id === "clients" && clients.length > 0 && (
                <span style={styles.menuBadge}>{clients.length}</span>
              )}
              {item.id === "notifications" && unreadNotifsCount > 0 && (
                <span style={styles.menuBadge}>{unreadNotifsCount}</span>
              )}
            </button>
          ))}
        </div>
        <div style={styles.sidebarBottom}>
          <button style={styles.logoutButton} onClick={onLogout}>
            Выйти
          </button>
        </div>
      </aside>
      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>
              {menu.find((m) => m.id === page)?.title}
            </h1>
            <p style={styles.pageSubtitle}>{user.companyName}</p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              style={{
                background: "#EFF6FF",
                border: "1px solid #BFDBFE",
                borderRadius: "20px",
                padding: "8px 12px",
                cursor: "pointer",
                display: "flex",
                gap: "6px",
                alignItems: "center",
                fontWeight: 600,
                fontSize: "13px",
                color: "#1D4ED8",
              }}
              onClick={onStartOnboarding}
            >
              <span>Обучение</span>
            </button>
            <button
              style={{
                background: "#EFF6FF",
                border: "1px solid #BFDBFE",
                borderRadius: "20px",
                padding: "8px 12px",
                cursor: "pointer",
                display: "flex",
                gap: "6px",
                alignItems: "center",
                fontWeight: 600,
                fontSize: "13px",
                color: "#1D4ED8",
              }}
              onClick={() => setPage("notifications")}
            >
              <Bell size={16} />
              <span>Уведомления</span>
              {unreadNotifsCount > 0 && <b>({unreadNotifsCount})</b>}
            </button>
            <div style={styles.headerUser}>{user.ownerName}</div>
          </div>
        </header>
        <section style={styles.content}>
          {error && (
            <div style={styles.errorTop}>
              <span>{error}</span>
              <button style={styles.errorClose} onClick={onClearError}>
                ×
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <DashboardHome
              clients={clients}
              transactions={transactions}
              campaigns={campaigns}
              totalIncome={totalIncome}
              totalExpense={totalExpense}
              netProfit={netProfit}
              activeCampaigns={activeCampaigns}
              setPage={setPage}
            />
          )}
          {page === "clients" && (
            <ClientsView
              clients={clients}
              onAddClient={onAddClient}
              onDeleteClient={onDeleteClient}
              onAddPurchase={onAddPurchase}
              onDeductBonuses={onDeductBonuses}
              cashbackRate={user.cashbackRate}
            />
          )}
          {page === "finances" && (
            <FinancesView
              transactions={transactions}
              totalIncome={totalIncome}
              totalExpense={totalExpense}
              netProfit={netProfit}
              onAddTransaction={onAddTransaction}
              onUpdateTransaction={onUpdateTransaction}
              onDeleteTransaction={onDeleteTransaction}
            />
          )}
          {page === "campaigns" && (
            <CampaignsView
              campaigns={campaigns}
              onAddCampaign={onAddCampaign}
              onUpdateCampaign={onUpdateCampaign}
              onDeleteCampaign={onDeleteCampaign}
            />
          )}
          {page === "analytics" && (
            <AnalyticsView
              clients={clients}
              transactions={transactions}
              campaigns={campaigns}
            />
          )}
          {page === "qr" && <QRView user={user} />}
          {page === "notifications" && (
            <BusinessNotificationsView
              notifications={businessNotifications}
              onMarkRead={onMarkBusinessNotificationRead}
            />
          )}
          {page === "profile" && (
            <ProfileView user={user} onUpdateUser={onUpdateUser} />
          )}
        </section>
      </main>
    </div>
  );
}

/* =========================================================
   HOME
========================================================= */
function DashboardHome({
  clients,
  transactions,
  totalIncome,
  totalExpense,
  netProfit,
  setPage,
}: {
  clients: Client[];
  transactions: Transaction[];
  campaigns: Campaign[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  activeCampaigns: number;
  setPage: (p: Page) => void;
}) {
  return (
    <div>
      <div style={styles.statsGrid}>
        <Stat title="Клиенты" value={String(clients.length)} icon="👥" />
        <Stat title="Доходы" value={money(totalIncome)} icon="📈" />
        <Stat title="Расходы" value={money(totalExpense)} icon="📉" />
        <Stat title="Чистая прибыль" value={money(netProfit)} icon="💰" />
      </div>
      <div style={styles.homeGrid}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Быстрые действия</h2>
          <div style={styles.quickGrid}>
            <QuickButton
              title="Клиенты"
              icon="👥"
              onClick={() => setPage("clients")}
            />
            <QuickButton
              title="Финансы"
              icon="💰"
              onClick={() => setPage("finances")}
            />
            <QuickButton
              title="Кампании"
              icon="🚀"
              onClick={() => setPage("campaigns")}
            />
            <QuickButton
              title="QR-код"
              icon="📱"
              onClick={() => setPage("qr")}
            />
          </div>
        </div>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Здоровье бизнеса</h2>
          <div style={styles.healthScore}>
            <div style={styles.healthCircle}>
              {clients.length > 0 ? "92" : "70"}
            </div>
            <div>
              <b>
                {clients.length > 0
                  ? "Отличные показатели"
                  : "Базовые настройки"}
              </b>
              <p style={styles.muted}>Данные синхронизированы с Supabase</p>
            </div>
          </div>
        </div>
      </div>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Последняя активность</h2>
        {transactions.length === 0 ? (
          <Empty text="Нет транзакций" />
        ) : (
          <div>
            {transactions.slice(0, 5).map((t) => (
              <div key={t.id} style={styles.activityRow}>
                <div>
                  <b>{t.category}</b>
                  <div style={styles.muted}>
                    {t.date} • {t.description}
                  </div>
                </div>
                <strong
                  style={{
                    color: t.type === "income" ? "#059669" : "#DC2626",
                  }}
                >
                  {t.type === "income" ? "+" : "-"}
                  {money(t.amount)}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   BUSINESS NOTIFICATIONS VIEW
========================================================= */
function BusinessNotificationsView({
  notifications,
  onMarkRead,
}: {
  notifications: BusinessNotification[];
  onMarkRead: (id: string) => void;
}) {
  return (
    <div>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Уведомления бизнеса</h2>
        <p style={styles.muted}>События и системные оповещения</p>
        <div style={{ marginTop: 20, display: "grid", gap: "12px" }}>
          {notifications.length === 0 ? (
            <Empty text="Уведомлений нет." />
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  ...styles.notificationCard,
                  opacity: n.isRead ? 0.7 : 1,
                  background: n.isRead ? "#F9FAFB" : "#FFFFFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: "14px",
                  padding: "16px",
                  display: "flex",
                  gap: "14px",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", gap: "12px" }}>
                  <div style={styles.notificationIcon}>
                    <Bell size={18} />
                  </div>
                  <div>
                    <b style={{ fontSize: "15px" }}>{n.title}</b>
                    <p style={{ margin: "4px 0", color: "#4B5563" }}>
                      {n.message}
                    </p>
                    <small style={{ color: "#9CA3AF" }}>
                      {n.createdAt
                        ? new Date(n.createdAt).toLocaleDateString("ru-RU")
                        : ""}
                    </small>
                  </div>
                </div>
                {!n.isRead && (
                  <button
                    style={styles.smallPrimary}
                    onClick={() => onMarkRead(n.id)}
                  >
                    Прочитано
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STAT
========================================================= */
function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: string;
}) {
  return (
    <div style={styles.stat}>
      <div style={styles.statIcon}>{icon}</div>
      <div style={styles.statLabel}>{title}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function QuickButton({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button style={styles.quickButton} onClick={onClick}>
      <span style={{ fontSize: 26 }}>{icon}</span>
      <span>{title}</span>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={styles.empty}>{text}</div>;
}

/* =========================================================
   CLIENTS
========================================================= */
function ClientsView({
  clients,
  onAddClient,
  onDeleteClient,
  onAddPurchase,
  onDeductBonuses,
  cashbackRate,
}: {
  clients: Client[];
  onAddClient: (data: { name: string; phone: string; email: string }) => void;
  onDeleteClient: (id: string) => void;
  onAddPurchase: (client: Client, amount: number, cashbackRate: number) => void;
  onDeductBonuses: (client: Client, amount: number) => void;
  cashbackRate: number;
}) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [purchaseClient, setPurchaseClient] = useState<Client | null>(null);
  const [deductClient, setDeductClient] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    );
  }, [clients, search]);

  return (
    <div>
      <div style={styles.toolbar}>
        <input
          style={styles.search}
          placeholder="Поиск клиентов..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={styles.primaryButton} onClick={() => setAddOpen(true)}>
          + Добавить клиента
        </button>
      </div>
      <div style={styles.clientGridCards}>
        {filtered.length === 0 ? (
          <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
            <Empty text="Клиенты не найдены. Используйте QR-код." />
          </div>
        ) : (
          filtered.map((c) => (
            <div key={c.id} style={styles.clientCardModern}>
              <div style={styles.clientCardHeader}>
                <div style={styles.clientAvatarLetter}>{c.name[0] || "C"}</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                    {c.name}
                  </h3>
                  <span style={styles.smallText}>
                    {c.phone} {c.email ? `• ${c.email}` : ""}
                  </span>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <StatusBadge
                    status={clientStatus(c.purchasesCount, c.totalSpent)}
                  />
                </div>
              </div>
              <div style={styles.clientCardBodyStats}>
                <div>
                  <small>Покупки</small>
                  <b>{c.purchasesCount}</b>
                </div>
                <div>
                  <small>Сумма</small>
                  <b>{money(c.totalSpent)}</b>
                </div>
                <div>
                  <small>Бонусы</small>
                  <b style={{ color: "#059669" }}>{money(c.bonusesBalance)}</b>
                </div>
              </div>
              <div style={styles.clientCardActions}>
                <button
                  style={styles.smallPrimary}
                  onClick={() => setPurchaseClient(c)}
                >
                  + Покупка
                </button>
                <button
                  style={styles.smallSecondary}
                  onClick={() => setDeductClient(c)}
                >
                  Списать
                </button>
                <button
                  style={styles.iconButtonDanger}
                  onClick={() => onDeleteClient(c.id)}
                  title="Удалить"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {addOpen && (
        <AddClientModal
          onClose={() => setAddOpen(false)}
          onSubmit={(data) => {
            onAddClient(data);
            setAddOpen(false);
          }}
        />
      )}
      {purchaseClient && (
        <PurchaseModal
          client={purchaseClient}
          cashbackRate={cashbackRate}
          onClose={() => setPurchaseClient(null)}
          onSubmit={(amount) => {
            onAddPurchase(purchaseClient, amount, cashbackRate);
            setPurchaseClient(null);
          }}
        />
      )}
      {deductClient && (
        <DeductBonusesModal
          client={deductClient}
          onClose={() => setDeductClient(null)}
          onSubmit={(amount) => {
            onDeductBonuses(deductClient, amount);
            setDeductClient(null);
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ClientStatus }) {
  const bg =
    status === "VIP"
      ? "#FEF3C7"
      : status === "Активный"
      ? "#DCFCE7"
      : "#F3F4F6";
  const color =
    status === "VIP"
      ? "#D97706"
      : status === "Активный"
      ? "#16A34A"
      : "#4B5563";
  return (
    <span
      style={{
        background: bg,
        color: color,
        padding: "4px 10px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: 700,
      }}
    >
      {status}
    </span>
  );
}

function AddClientModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; phone: string; email: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <h2>Добавить клиента</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name, phone, email });
          }}
        >
          <Input
            label="Имя"
            value={name}
            onChange={setName}
            placeholder="Иван"
          />
          <Input
            label="Телефон"
            value={phone}
            onChange={setPhone}
            placeholder="+7 777 000 00 00"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="client@example.com"
          />
          <div style={styles.modalActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={onClose}
            >
              Отмена
            </button>
            <button type="submit" style={styles.primaryButton}>
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PurchaseModal({
  client,
  cashbackRate,
  onClose,
  onSubmit,
}: {
  client: Client;
  cashbackRate: number;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <h2>Новая покупка</h2>
        <p style={styles.muted}>
          Клиент: <b>{client.name}</b> (кэшбэк {cashbackRate}%)
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(Number(amount));
          }}
        >
          <Input
            label="Сумма покупки (₸)"
            type="number"
            value={amount}
            onChange={setAmount}
            placeholder="5000"
          />
          {amount && !isNaN(Number(amount)) && (
            <div
              style={{ margin: "10px 0", fontSize: "13px", color: "#059669" }}
            >
              Будет начислено бонусов:{" "}
              <b>{money((Number(amount) * cashbackRate) / 100)}</b>
            </div>
          )}
          <div style={styles.modalActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={onClose}
            >
              Отмена
            </button>
            <button type="submit" style={styles.primaryButton}>
              Провести
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeductBonusesModal({
  client,
  onClose,
  onSubmit,
}: {
  client: Client;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <h2>Списать бонусы</h2>
        <p style={styles.muted}>
          Клиент: <b>{client.name}</b> | Доступно:{" "}
          <b>{money(client.bonusesBalance)}</b>
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(Number(amount));
          }}
        >
          <Input
            label="Сумма списания"
            type="number"
            value={amount}
            onChange={setAmount}
            placeholder="500"
          />
          <div style={styles.modalActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={onClose}
            >
              Отмена
            </button>
            <button type="submit" style={styles.primaryButton}>
              Списать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   FINANCES
========================================================= */
function FinancesView({
  transactions,
  totalIncome,
  totalExpense,
  netProfit,
  onAddTransaction,
  onDeleteTransaction,
}: {
  transactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  onAddTransaction: (data: Omit<Transaction, "id" | "companyId">) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>("income");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Продажи");
  const [date, setDate] = useState(dateNow());
  const [description, setDescription] = useState("");

  return (
    <div>
      <div style={styles.statsGrid}>
        <Stat title="Доходы" value={money(totalIncome)} icon="📈" />
        <Stat title="Расходы" value={money(totalExpense)} icon="📉" />
        <Stat title="Чистая прибыль" value={money(netProfit)} icon="💰" />
        <Stat
          title="Всего операций"
          value={String(transactions.length)}
          icon="📋"
        />
      </div>
      <div style={styles.card}>
        <div style={styles.toolbar}>
          <h2 style={styles.cardTitle}>Финансовые транзакции</h2>
          <button style={styles.primaryButton} onClick={() => setOpen(true)}>
            + Добавить
          </button>
        </div>
        {transactions.length === 0 ? (
          <Empty text="Нет транзакций." />
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Дата</th>
                  <th style={styles.th}>Тип</th>
                  <th style={styles.th}>Категория</th>
                  <th style={styles.th}>Описание</th>
                  <th style={styles.th}>Сумма</th>
                  <th style={styles.th}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td style={styles.td}>{t.date}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          color: t.type === "income" ? "#059669" : "#DC2626",
                          fontWeight: 700,
                        }}
                      >
                        {t.type === "income" ? "Доход" : "Расход"}
                      </span>
                    </td>
                    <td style={styles.td}>{t.category}</td>
                    <td style={styles.td}>{t.description}</td>
                    <td style={styles.td}>
                      <b
                        style={{
                          color: t.type === "income" ? "#059669" : "#DC2626",
                        }}
                      >
                        {t.type === "income" ? "+" : "-"}
                        {money(t.amount)}
                      </b>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.iconButtonDanger}
                        onClick={() => onDeleteTransaction(t.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h2>Новая транзакция</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onAddTransaction({
                  type,
                  amount: Number(amount),
                  category,
                  date,
                  description,
                });
                setOpen(false);
              }}
            >
              <div style={styles.inputGroup}>
                <label style={styles.label}>Тип</label>
                <select
                  style={styles.input}
                  value={type}
                  onChange={(e) => setType(e.target.value as TransactionType)}
                >
                  <option value="income">Доход</option>
                  <option value="expense">Расход</option>
                </select>
              </div>
              <Input
                label="Сумма"
                type="number"
                value={amount}
                onChange={setAmount}
                placeholder="10000"
              />
              <Input
                label="Категория"
                value={category}
                onChange={setCategory}
                placeholder="Продажи"
              />
              <Input label="Дата" type="date" value={date} onChange={setDate} />
              <Input
                label="Описание"
                value={description}
                onChange={setDescription}
                placeholder="Заметка..."
              />
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setOpen(false)}
                >
                  Отмена
                </button>
                <button type="submit" style={styles.primaryButton}>
                  Добавить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   CAMPAIGNS
========================================================= */
function CampaignsView({
  campaigns,
  onAddCampaign,
  onDeleteCampaign,
}: {
  campaigns: Campaign[];
  onAddCampaign: (data: Omit<Campaign, "id" | "companyId">) => void;
  onUpdateCampaign: (c: Campaign) => void;
  onDeleteCampaign: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(dateNow());
  const [endDate, setEndDate] = useState(dateNow());
  const [budget, setBudget] = useState("");
  const [expectedRevenue, setExpectedRevenue] = useState("");

  return (
    <div>
      <div style={styles.toolbar}>
        <div>
          <h2 style={styles.cardTitle}>Маркетинговые кампании</h2>
          <p style={styles.muted}>Управление акциями и спецпредложениями</p>
        </div>
        <button style={styles.primaryButton} onClick={() => setOpen(true)}>
          + Создать кампанию
        </button>
      </div>
      <div style={styles.campaignGridCards}>
        {campaigns.length === 0 ? (
          <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
            <Empty text="Кампаний нет." />
          </div>
        ) : (
          campaigns.map((c) => (
            <div key={c.id} style={styles.campaignCardModern}>
              <div style={styles.campaignTopRow}>
                <h3>{c.name}</h3>
                <span
                  style={{
                    background: c.status === "Активна" ? "#DCFCE7" : "#F3F4F6",
                    color: c.status === "Активна" ? "#16A34A" : "#4B5563",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {c.status}
                </span>
              </div>
              <div style={styles.campaignDetails}>
                <div>
                  <small>Бюджет</small>
                  <b>{money(c.budget)}</b>
                </div>
                <div>
                  <small>Ожидаемый доход</small>
                  <b style={{ color: "#059669" }}>{money(c.expectedRevenue)}</b>
                </div>
              </div>
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "12px",
                  color: "#6B7280",
                }}
              >
                Период: {c.startDate} — {c.endDate}
              </div>
              <div
                style={{
                  marginTop: "15px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  style={styles.iconButtonDanger}
                  onClick={() => onDeleteCampaign(c.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h2>Новая кампания</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onAddCampaign({
                  name,
                  startDate,
                  endDate,
                  budget: Number(budget),
                  expectedRevenue: Number(expectedRevenue),
                  status: "Активна",
                  expectedGrowth: "+22%",
                  expectedProfit: "+50 000 ₸",
                });
                setOpen(false);
              }}
            >
              <Input
                label="Название"
                value={name}
                onChange={setName}
                placeholder="Скидка -20%"
              />
              <Input
                label="Дата начала"
                type="date"
                value={startDate}
                onChange={setStartDate}
              />
              <Input
                label="Дата окончания"
                type="date"
                value={endDate}
                onChange={setEndDate}
              />
              <Input
                label="Бюджет"
                type="number"
                value={budget}
                onChange={setBudget}
                placeholder="10000"
              />
              <Input
                label="Ожидаемый доход"
                type="number"
                value={expectedRevenue}
                onChange={setExpectedRevenue}
                placeholder="50000"
              />
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setOpen(false)}
                >
                  Отмена
                </button>
                <button type="submit" style={styles.primaryButton}>
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   ANALYTICS
========================================================= */
function AnalyticsView({
  clients,
  transactions,
}: {
  clients: Client[];
  transactions: Transaction[];
  campaigns: Campaign[];
}) {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>AI-Аналитика и рекомендации</h2>
        <p style={styles.muted}>Автоматический анализ показателей бизнеса</p>
        <div style={{ marginTop: 20, display: "grid", gap: "15px" }}>
          <div style={styles.aiCard}>
            <b>Рост базы клиентов</b>
            <p>
              {clients.length < 3
                ? "Рекомендуем активнее делиться QR-кодом для привлечения первых постоянных клиентов."
                : "Отличный приток клиентов! Попробуйте запустить персональные акции для VIP сегмента."}
            </p>
          </div>
          <div style={styles.aiCard}>
            <b>Финансовая оптимизация</b>
            <p>
              {totalIncome === 0
                ? "Добавьте первые транзакции доходов, чтобы AI сформировал финансовые прогнозы."
                : "Ваши доходы превышают базовые расходы. Рекомендуем увеличить маркетинговый бюджет на 10%."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   QR VIEW
========================================================= */
function QRView({ user }: { user: BusinessUser }) {
  const qrUrl = `${window.location.origin}?company=${user.id}&qr=${
    user.qrToken || "default"
  }`;
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>QR-код для клиентов</h2>
      <p style={styles.muted}>
        Разместите этот QR-код на кассе или в зале для автоматической
        регистрации клиентов.
      </p>
      <div
        style={{
          display: "flex",
          gap: "30px",
          alignItems: "center",
          marginTop: "30px",
        }}
      >
        <div
          style={{
            background: "#FFFFFF",
            padding: "20px",
            borderRadius: "20px",
            border: "1px solid #E5E7EB",
          }}
        >
          <QRCodeSVG value={qrUrl} size={180} />
        </div>
        <div>
          <h3>{user.companyName}</h3>
          <p style={styles.muted}>Кэшбэк: {user.cashbackRate}%</p>
          <div
            style={{
              background: "#F3F4F6",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "12px",
              wordBreak: "break-all",
              maxWidth: "400px",
              marginTop: "10px",
            }}
          >
            {qrUrl}
          </div>
          <button
            style={{ ...styles.primaryButton, marginTop: "15px" }}
            onClick={() => navigator.clipboard.writeText(qrUrl)}
          >
            Скопировать ссылку
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PROFILE
========================================================= */
function ProfileView({
  user,
  onUpdateUser,
}: {
  user: BusinessUser;
  onUpdateUser: (u: BusinessUser) => void;
}) {
  const [ownerName, setOwnerName] = useState(user.ownerName);
  const [companyName, setCompanyName] = useState(user.companyName);
  const [businessType, setBusinessType] = useState(user.businessType);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [cashbackRate, setCashbackRate] = useState(String(user.cashbackRate));
  const [saved, setSaved] = useState(false);

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Настройки профиля</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onUpdateUser({
            ...user,
            ownerName,
            companyName,
            businessType,
            email,
            phone,
            cashbackRate: Number(cashbackRate),
          });
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        }}
      >
        <Input
          label="Имя владельца"
          value={ownerName}
          onChange={setOwnerName}
        />
        <Input
          label="Название компании"
          value={companyName}
          onChange={setCompanyName}
        />
        <div style={styles.inputGroup}>
          <label style={styles.label}>Тип бизнеса</label>
          <select
            style={styles.input}
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          >
            <option value="Coffee">Coffee</option>
            <option value="Restaurant">Restaurant</option>
            <option value="Beauty">Beauty</option>
            <option value="Retail">Retail</option>
            <option value="Fitness">Fitness</option>
          </select>
        </div>
        <Input label="Email" value={email} onChange={setEmail} />
        <Input label="Телефон" value={phone} onChange={setPhone} />
        <Input
          label="Кэшбэк (%)"
          type="number"
          value={cashbackRate}
          onChange={setCashbackRate}
        />
        {saved && <div style={styles.successBox}>Сохранено!</div>}
        <button
          type="submit"
          style={{ ...styles.primaryButton, marginTop: "20px" }}
        >
          Сохранить изменения
        </button>
      </form>
    </div>
  );
}

/* =========================================================
   STYLES
========================================================= */
const styles: { [key: string]: React.CSSProperties } = {
  loadingScreen: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#F8FAFC",
  },
  loadingCard: {
    textAlign: "center" as const,
    padding: "40px",
  },
  logoCircle: {
    width: "60px",
    height: "60px",
    borderRadius: "16px",
    background: "linear-gradient(135deg, #6366F1, #3B82F6)",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    fontSize: "22px",
    margin: "0 auto 15px",
  },
  authPage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #EEF2FF, #F8FAFC)",
    padding: "20px",
  },
  authContainer: {
    width: "min(460px, 100%)",
    background: "#FFFFFF",
    borderRadius: "24px",
    padding: "35px",
    boxShadow:
      "0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  },
  authBrand: {
    display: "flex",
    gap: "14px",
    alignItems: "center",
    marginBottom: "20px",
  },
  brandTitle: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#1E293B",
  },
  brandSubtitle: {
    fontSize: "12px",
    color: "#64748B",
  },
  authTabs: {
    display: "flex",
    background: "#F1F5F9",
    padding: "4px",
    borderRadius: "12px",
    marginBottom: "20px",
  },
  authTab: {
    flex: 1,
    padding: "10px",
    border: "none",
    background: "transparent",
    fontWeight: 700,
    color: "#64748B",
    cursor: "pointer",
    borderRadius: "8px",
  },
  authTabActive: {
    flex: 1,
    padding: "10px",
    border: "none",
    background: "#FFFFFF",
    fontWeight: 700,
    color: "#4F46E5",
    cursor: "pointer",
    borderRadius: "8px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  authForm: {},
  authTitle: {
    fontSize: "22px",
    fontWeight: 800,
    marginBottom: "20px",
    color: "#1E293B",
  },
  inputGroup: {
    marginBottom: "15px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 700,
    color: "#475569",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid #CBD5E1",
    outline: "none",
    fontSize: "14px",
    color: "#1E293B",
    background: "#FFFFFF",
  },
  primaryButtonFull: {
    width: "100%",
    padding: "13px",
    background: "linear-gradient(135deg, #6366F1, #4F46E5)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "12px",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "10px",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
  },
  primaryButton: {
    padding: "10px 18px",
    background: "linear-gradient(135deg, #6366F1, #4F46E5)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "10px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
  },
  secondaryButton: {
    padding: "10px 18px",
    background: "#F1F5F9",
    color: "#475569",
    border: "1px solid #CBD5E1",
    borderRadius: "10px",
    fontWeight: 700,
    cursor: "pointer",
  },
  errorBox: {
    background: "#FEF2F2",
    color: "#DC2626",
    padding: "12px",
    borderRadius: "10px",
    fontSize: "13px",
    marginBottom: "15px",
  },
  successBox: {
    background: "#F0FDF4",
    color: "#16A34A",
    padding: "12px",
    borderRadius: "10px",
    fontSize: "13px",
    marginBottom: "15px",
  },
  dashboard: {
    minHeight: "100vh",
    display: "flex",
    background: "#F8FAFC",
  },
  sidebar: {
    width: "260px",
    background: "#0F172A",
    color: "#FFFFFF",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: 0,
    height: "100vh",
  },
  sidebarLogo: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    marginBottom: "30px",
    padding: "0 8px",
  },
  smallLogo: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #6366F1, #3B82F6)",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
  },
  sidebarCompany: {
    fontSize: "11px",
    color: "#94A3B8",
    marginTop: "2px",
  },
  sidebarMenu: {
    display: "grid",
    gap: "6px",
    flex: 1,
  },
  menuItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    background: "transparent",
    border: "none",
    color: "#94A3B8",
    fontWeight: 700,
    borderRadius: "10px",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  menuActive: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    background: "#1E293B",
    border: "none",
    color: "#FFFFFF",
    fontWeight: 700,
    borderRadius: "10px",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  menuBadge: {
    background: "#6366F1",
    color: "#FFFFFF",
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "11px",
  },
  sidebarBottom: {
    borderTop: "1px solid #1E293B",
    paddingTop: "15px",
  },
  logoutButton: {
    width: "100%",
    padding: "10px",
    background: "transparent",
    border: "none",
    color: "#94A3B8",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left" as const,
    borderRadius: "8px",
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    height: "80px",
    background: "#FFFFFF",
    borderBottom: "1px solid #E2E8F0",
    padding: "0 35px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontSize: "20px",
    fontWeight: 800,
    margin: 0,
    color: "#1E293B",
  },
  pageSubtitle: {
    fontSize: "12px",
    color: "#64748B",
    margin: "2px 0 0",
  },
  headerUser: {
    fontWeight: 700,
    color: "#334155",
    background: "#F1F5F9",
    padding: "8px 14px",
    borderRadius: "10px",
    fontSize: "13px",
  },
  content: {
    padding: "30px 35px",
    flex: 1,
  },
  errorTop: {
    background: "#FEF2F2",
    color: "#DC2626",
    padding: "12px 20px",
    borderRadius: "12px",
    marginBottom: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorClose: {
    background: "transparent",
    border: "none",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
    color: "#DC2626",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "20px",
    marginBottom: "25px",
  },
  stat: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
  },
  statIcon: {
    fontSize: "24px",
    marginBottom: "10px",
  },
  statLabel: {
    fontSize: "13px",
    color: "#64748B",
    fontWeight: 600,
  },
  statValue: {
    fontSize: "22px",
    fontWeight: 800,
    color: "#1E293B",
    marginTop: "4px",
  },
  homeGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: "20px",
    marginBottom: "25px",
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "18px",
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
    marginBottom: "25px",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#1E293B",
    margin: "0 0 15px",
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
  },
  quickButton: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: "14px",
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "8px",
    cursor: "pointer",
    fontWeight: 700,
    color: "#1E293B",
  },
  healthScore: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
  },
  healthCircle: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    background: "#DCFCE7",
    color: "#16A34A",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: "20px",
  },
  activityRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #F1F5F9",
  },
  muted: {
    fontSize: "13px",
    color: "#64748B",
    margin: 0,
  },
  empty: {
    textAlign: "center" as const,
    padding: "30px",
    color: "#94A3B8",
    fontSize: "14px",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    gap: "15px",
  },
  search: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #CBD5E1",
    outline: "none",
    width: "280px",
    fontSize: "14px",
  },
  tableWrap: {
    overflowX: "auto" as const,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    textAlign: "left" as const,
  },
  th: {
    padding: "12px 16px",
    background: "#F8FAFC",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 700,
    borderBottom: "1px solid #E2E8F0",
  },
  td: {
    padding: "14px 16px",
    fontSize: "14px",
    color: "#1E293B",
    borderBottom: "1px solid #F1F5F9",
  },
  badge: {
    background: "#EEF2FF",
    color: "#4F46E5",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 700,
  },
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(15, 23, 42, 0.5)",
    display: "grid",
    placeItems: "center",
    zIndex: 1000,
    padding: "20px",
  },
  modalCard: {
    width: "min(440px, 100%)",
    background: "#FFFFFF",
    borderRadius: "20px",
    padding: "30px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "20px",
  },
  clientGridCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "20px",
  },
  clientCardModern: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
  },
  clientCardHeader: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    marginBottom: "15px",
  },
  clientAvatarLetter: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    background: "#EEF2FF",
    color: "#4F46E5",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: "16px",
  },
  smallText: {
    fontSize: "12px",
    color: "#64748B",
  },
  clientCardBodyStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    background: "#F8FAFC",
    padding: "12px",
    borderRadius: "12px",
    textAlign: "center" as const,
    marginBottom: "15px",
  },
  clientCardActions: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  smallPrimary: {
    padding: "6px 12px",
    background: "#4F46E5",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  },
  smallSecondary: {
    padding: "6px 12px",
    background: "#F1F5F9",
    color: "#475569",
    border: "1px solid #CBD5E1",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  },
  iconButtonDanger: {
    padding: "6px",
    background: "#FEF2F2",
    color: "#DC2626",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    marginLeft: "auto",
    display: "grid",
    placeItems: "center",
  },
  campaignGridCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "20px",
  },
  campaignCardModern: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "18px",
    padding: "20px",
  },
  campaignTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  campaignDetails: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    background: "#F8FAFC",
    padding: "12px",
    borderRadius: "12px",
  },
  aiCard: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    padding: "16px",
    borderRadius: "14px",
  },
  clientPage: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#F8FAFC",
    padding: "20px",
  },
  clientCard: {
    width: "min(420px, 100%)",
    background: "#FFFFFF",
    borderRadius: "24px",
    padding: "35px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.05)",
  },
  clientSubtitle: {
    fontSize: "14px",
    color: "#64748B",
    margin: "10px 0 20px",
  },
  infoBox: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    padding: "16px",
    borderRadius: "14px",
    marginBottom: "20px",
  },
  clientPortalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "30px",
  },
  clientHero: {
    background: "linear-gradient(135deg, #4F46E5, #6366F1)",
    color: "#FFFFFF",
    borderRadius: "24px",
    padding: "35px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "30px",
  },
  clientHeroEyebrow: {
    fontSize: "12px",
    fontWeight: 700,
    opacity: 0.8,
    marginBottom: "6px",
  },
  clientHeroTitle: {
    fontSize: "24px",
    fontWeight: 800,
    margin: "0 0 8px",
  },
  clientHeroText: {
    fontSize: "14px",
    opacity: 0.9,
    margin: 0,
  },
  clientHeroBadge: {
    background: "rgba(255,255,255,0.15)",
    backdropFilter: "blur(10px)",
    padding: "16px 20px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "4px",
  },
  clientPortalGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: "25px",
  },
  portalSectionTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
  },
  membershipCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "15px",
  },
  membershipTop: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    marginBottom: "15px",
  },
  membershipLogo: {
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    background: "#EEF2FF",
    color: "#4F46E5",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
  },
  membershipCashback: {
    background: "#F0FDF4",
    color: "#16A34A",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 700,
  },
  membershipStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    background: "#F8FAFC",
    padding: "12px",
    borderRadius: "12px",
    textAlign: "center" as const,
  },
  notificationsList: {
    display: "grid",
    gap: "12px",
  },
  notificationCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "14px",
    padding: "16px",
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    cursor: "pointer",
    width: "100%",
  },
  notificationIcon: {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    background: "#EEF2FF",
    color: "#4F46E5",
    display: "grid",
    placeItems: "center",
  },
  adminPage: {
    minHeight: "100vh",
    display: "flex",
    background: "#F8FAFC",
  },
  adminSidebar: {
    width: "260px",
    background: "#0F172A",
    color: "#FFFFFF",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: 0,
    height: "100vh",
  },
  adminBadge: {
    background: "#1E293B",
    padding: "8px 12px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#38BDF8",
    textAlign: "center" as const,
  },
  adminMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
};
