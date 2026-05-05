// =====================================================
// localStorage-based API (GitHub Pages compatible)
// =====================================================

const _db = {
  get: (key, def = []) => JSON.parse(localStorage.getItem(key) || JSON.stringify(def)),
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  nextId: (key) => {
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    return arr.length ? Math.max(...arr.map(i => i.id)) + 1 : 1;
  }
};

// Seed default categories on first load
(function seedDefaults() {
  if (!localStorage.getItem('pft_seeded')) {
    _db.set('pft_categories', [
      { id: 1, name: 'Salary',       type: 'income',  icon: '💰' },
      { id: 2, name: 'Freelance',    type: 'income',  icon: '💻' },
      { id: 3, name: 'Food',         type: 'expense', icon: '🍔' },
      { id: 4, name: 'Transport',    type: 'expense', icon: '🚌' },
      { id: 5, name: 'Shopping',     type: 'expense', icon: '🛍️' },
      { id: 6, name: 'Bills',        type: 'expense', icon: '📄' },
      { id: 7, name: 'Health',       type: 'expense', icon: '🏥' },
      { id: 8, name: 'Entertainment',type: 'expense', icon: '🎬' },
    ]);
    _db.set('pft_transactions', []);
    _db.set('pft_budgets', []);
    _db.set('pft_goals', []);
    localStorage.setItem('pft_seeded', '1');
  }
})();

class API {
  static token = localStorage.getItem('authToken');

  // ---- AUTH ----
  static async register(userData) {
    const users = _db.get('pft_users', []);
    if (users.find(u => u.email === userData.email)) {
      return { error: 'Email already registered' };
    }
    const user = { id: (users.length + 1), name: userData.name, email: userData.email, password: userData.password };
    users.push(user);
    _db.set('pft_users', users);
    const token = btoa(user.email + ':' + Date.now());
    localStorage.setItem('authToken', token);
    localStorage.setItem('currentUser', JSON.stringify({ id: user.id, name: user.name, email: user.email }));
    API.token = token;
    return { success: true, token, user: { id: user.id, name: user.name, email: user.email } };
  }

  static async login(email, password) {
    const users = _db.get('pft_users', []);
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return { error: 'Invalid email or password' };
    const token = btoa(user.email + ':' + Date.now());
    localStorage.setItem('authToken', token);
    localStorage.setItem('currentUser', JSON.stringify({ id: user.id, name: user.name, email: user.email }));
    API.token = token;
    return { success: true, token, user: { id: user.id, name: user.name, email: user.email } };
  }

  static async logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    API.token = null;
    return { success: true };
  }

  static async changePassword({ oldPassword, newPassword }) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) return { error: 'Not authenticated' };
    const users = _db.get('pft_users', []);
    const idx = users.findIndex(u => u.id === currentUser.id);
    if (idx === -1 || users[idx].password !== oldPassword) return { error: 'Incorrect current password' };
    users[idx].password = newPassword;
    _db.set('pft_users', users);
    return { success: true };
  }

  // ---- HELPERS ----
  static _currentUserId() {
    const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
    return u ? u.id : null;
  }

  // ---- TRANSACTIONS ----
  static async createTransaction(data) {
    const uid = API._currentUserId();
    const list = _db.get('pft_transactions', []);
    const item = { ...data, id: _db.nextId('pft_transactions'), userId: uid, createdAt: new Date().toISOString() };
    list.push(item);
    _db.set('pft_transactions', list);
    return { success: true, data: item };
  }

  static async getTransactions(filters = {}) {
    const uid = API._currentUserId();
    let list = _db.get('pft_transactions', []).filter(t => t.userId === uid);
    if (filters.type)       list = list.filter(t => t.type === filters.type);
    if (filters.category)   list = list.filter(t => String(t.categoryId) === String(filters.category));
    if (filters.start_date) list = list.filter(t => t.date >= filters.start_date);
    if (filters.end_date)   list = list.filter(t => t.date <= filters.end_date);
    list.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { success: true, data: list };
  }

  static async getTransaction(id) {
    const uid = API._currentUserId();
    const item = _db.get('pft_transactions', []).find(t => t.id === Number(id) && t.userId === uid);
    return item ? { success: true, data: item } : { error: 'Not found' };
  }

  static async updateTransaction(id, data) {
    const uid = API._currentUserId();
    const list = _db.get('pft_transactions', []);
    const idx = list.findIndex(t => t.id === Number(id) && t.userId === uid);
    if (idx === -1) return { error: 'Not found' };
    list[idx] = { ...list[idx], ...data };
    _db.set('pft_transactions', list);
    return { success: true, data: list[idx] };
  }

  static async deleteTransaction(id) {
    const uid = API._currentUserId();
    let list = _db.get('pft_transactions', []);
    list = list.filter(t => !(t.id === Number(id) && t.userId === uid));
    _db.set('pft_transactions', list);
    return { success: true };
  }

  static async getMonthlySummary(year, month) {
    const uid = API._currentUserId();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const list = _db.get('pft_transactions', []).filter(t => t.userId === uid && t.date.startsWith(prefix));
    const income  = list.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    return { success: true, data: { income, expense, balance: income - expense, transactions: list } };
  }

  static async getSpendingByCategory(startDate, endDate) {
    const uid = API._currentUserId();
    const list = _db.get('pft_transactions', [])
      .filter(t => t.userId === uid && t.type === 'expense' && t.date >= startDate && t.date <= endDate);
    const grouped = {};
    list.forEach(t => {
      grouped[t.categoryId] = (grouped[t.categoryId] || 0) + Number(t.amount);
    });
    return { success: true, data: grouped };
  }

  // ---- CATEGORIES ----
  static async getCategories(type = null) {
    let list = _db.get('pft_categories', []);
    if (type) list = list.filter(c => c.type === type);
    return { success: true, data: list };
  }

  static async createCategory(data) {
    const list = _db.get('pft_categories', []);
    const item = { ...data, id: _db.nextId('pft_categories') };
    list.push(item);
    _db.set('pft_categories', list);
    return { success: true, data: item };
  }

  static async updateCategory(id, data) {
    const list = _db.get('pft_categories', []);
    const idx = list.findIndex(c => c.id === Number(id));
    if (idx === -1) return { error: 'Not found' };
    list[idx] = { ...list[idx], ...data };
    _db.set('pft_categories', list);
    return { success: true, data: list[idx] };
  }

  static async deleteCategory(id) {
    let list = _db.get('pft_categories', []);
    list = list.filter(c => c.id !== Number(id));
    _db.set('pft_categories', list);
    return { success: true };
  }

  // ---- BUDGETS ----
  static async getBudgets() {
    const uid = API._currentUserId();
    const list = _db.get('pft_budgets', []).filter(b => b.userId === uid);
    return { success: true, data: list };
  }

  static async createBudget(data) {
    const uid = API._currentUserId();
    const list = _db.get('pft_budgets', []);
    const item = { ...data, id: _db.nextId('pft_budgets'), userId: uid };
    list.push(item);
    _db.set('pft_budgets', list);
    return { success: true, data: item };
  }

  static async updateBudget(id, data) {
    const uid = API._currentUserId();
    const list = _db.get('pft_budgets', []);
    const idx = list.findIndex(b => b.id === Number(id) && b.userId === uid);
    if (idx === -1) return { error: 'Not found' };
    list[idx] = { ...list[idx], ...data };
    _db.set('pft_budgets', list);
    return { success: true, data: list[idx] };
  }

  static async deleteBudget(id) {
    const uid = API._currentUserId();
    let list = _db.get('pft_budgets', []);
    list = list.filter(b => !(b.id === Number(id) && b.userId === uid));
    _db.set('pft_budgets', list);
    return { success: true };
  }

  // ---- SAVINGS GOALS ----
  static async getGoals() {
    const uid = API._currentUserId();
    const list = _db.get('pft_goals', []).filter(g => g.userId === uid);
    return { success: true, data: list };
  }

  static async createGoal(data) {
    const uid = API._currentUserId();
    const list = _db.get('pft_goals', []);
    const item = { ...data, id: _db.nextId('pft_goals'), userId: uid };
    list.push(item);
    _db.set('pft_goals', list);
    return { success: true, data: item };
  }

  static async updateGoal(id, data) {
    const uid = API._currentUserId();
    const list = _db.get('pft_goals', []);
    const idx = list.findIndex(g => g.id === Number(id) && g.userId === uid);
    if (idx === -1) return { error: 'Not found' };
    list[idx] = { ...list[idx], ...data };
    _db.set('pft_goals', list);
    return { success: true, data: list[idx] };
  }

  static async deleteGoal(id) {
    const uid = API._currentUserId();
    let list = _db.get('pft_goals', []);
    list = list.filter(g => !(g.id === Number(id) && g.userId === uid));
    _db.set('pft_goals', list);
    return { success: true };
  }

  // ---- DASHBOARD ----
  static async getDashboardData() {
    const uid = API._currentUserId();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;

    const allTx = _db.get('pft_transactions', []).filter(t => t.userId === uid);
    const monthTx = allTx.filter(t => t.date.startsWith(prefix));

    const totalIncome  = allTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = allTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const monthIncome  = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const monthExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    const budgets = _db.get('pft_budgets', []).filter(b => b.userId === uid);
    const goals   = _db.get('pft_goals',   []).filter(g => g.userId === uid);

    return {
      success: true,
      data: {
        balance: totalIncome - totalExpense,
        monthlyIncome: monthIncome,
        monthlyExpense: monthExpense,
        totalTransactions: allTx.length,
        recentTransactions: allTx.slice(-5).reverse(),
        budgets,
        goals
      }
    };
  }
}
