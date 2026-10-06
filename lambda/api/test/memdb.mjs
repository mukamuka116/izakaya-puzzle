// memdb.mjs — テスト用のメモリ上のDB（db.mjs と同じ関数を持つ）
export function createMemDb() {
  const accounts = new Map();
  const scores = new Map(); // `${board}\u0000${sk}` -> item
  const key = (b, s) => `${b}\u0000${s}`;
  const clone = (x) => (x === undefined ? x : structuredClone(x));

  const inBoard = (board) => [...scores.values()].filter((i) => i.board === board).sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));

  return {
    _accounts: accounts, _scores: scores,
    async getAccount(id) { return clone(accounts.get(id)) ?? null; },
    async createAccount(item) {
      if (accounts.has(item.loginId)) return false;
      accounts.set(item.loginId, clone({ ...item, ver: 1 }));
      return true;
    },
    async saveAccount(item) {
      const cur = accounts.get(item.loginId);
      if (!cur || cur.ver !== item.ver) return false;
      item.ver += 1;
      accounts.set(item.loginId, clone(item));
      return true;
    },
    async deleteAccount(id) { accounts.delete(id); },
    async getAccounts(ids) {
      const out = {};
      for (const id of ids) if (accounts.has(id)) { const a = accounts.get(id); out[id] = { loginId: id, nickname: a.nickname, avatar: a.avatar, title: a.title }; }
      return out;
    },
    async putScore(item) { scores.set(key(item.board, item.sk), clone(item)); },
    async deleteScore(board, sk) { scores.delete(key(board, sk)); },
    async queryBoard(board, limit) { return inBoard(board).slice(0, limit).map(clone); },
    async countBefore(board, sk) { return inBoard(board).filter((i) => i.sk < sk).length; },
    async claimStart(nonce) {
      const k = key('USED', nonce);
      if (scores.has(k)) return false;
      scores.set(k, { board: 'USED', sk: nonce });
      return true;
    },
  };
}
