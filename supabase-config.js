// supabase-config.js — Supabase 連線設定
// ---------------------------------------------------------------------------
// 這兩個值是「公開」的,可以放進網頁原始碼:
//   - URL 就是你的專案網址
//   - anon key 是設計成公開用的金鑰,真正的保護靠資料庫的 Row Level Security（RLS）,
//     也就是你在 Supabase SQL Editor 貼上的那份規則:每個人只能存取自己的資料。
//
// ⚠️ 絕對不要把 service_role 金鑰或資料庫密碼放進來——那些是機密。
// ---------------------------------------------------------------------------

export const SUPABASE_URL = 'https://pwjyqxpadaadvbecrckw.supabase.co';

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3anlxeHBhZGFhZHZiZWNyY2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzczMDcsImV4cCI6MjEwMDk1MzMwN30.PmWg8Charfop5-6RL0N40QsarISXTlwrlvRILJ7vIEQ';

// Google Drive 備份用的 OAuth 用戶端 ID(網頁型;此值可公開,靠「授權來源網域」限制,
// 只有你的網站能用)。到 Google Cloud Console 建立後貼在這裡;留空則備份按鈕會顯示未設定。
export const GOOGLE_CLIENT_ID = '572381433742-0cscf9t5f0klpsr9vd77p0prt32i81p7.apps.googleusercontent.com';
