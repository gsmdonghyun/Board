// ─── Supabase 초기화 ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://tgfhtddwagzkedroyjgk.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZUJ2WaeJhqjid7gxcC4CCw_0h04Kxw1";
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── 상수 ──────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;
const PINNED_NOTICE_LIMIT = 2;
const MAX_IMAGE_COUNT = 3;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB

// ─── 상태 ──────────────────────────────────────────────────────────────────────
let currentUser = null;       // { id, username, role } — Supabase auth user + profile
let currentRoute = "home";
let selectedPostId = null;
let editingPostId = null;
let duplicateCheckedId = "";
let profileUserId = null;     // UUID
let activeProfileTab = "posts";
let activeBoard = "all";
let currentPage = 1;
let selectedPostImages = []; // [{ name, src, type }]

// ─── DOM 참조 ──────────────────────────────────────────────────────────────────
const views = {
  home: document.querySelector("#homeView"),
  login: document.querySelector("#loginView"),
  signup: document.querySelector("#signupView"),
  write: document.querySelector("#writeView"),
  mypage: document.querySelector("#mypageView"),
  detail: document.querySelector("#detailView"),
};

const notice         = document.querySelector("#notice");
const sessionStatus  = document.querySelector("#sessionStatus");
const loginNavButton = document.querySelector("#loginNavButton");
const myPageNavButton= document.querySelector("#myPageNavButton");
const logoutButton   = document.querySelector("#logoutButton");
const writeNavButton = document.querySelector("#writeNavButton");
const postList       = document.querySelector("#postList");
const pagination     = document.querySelector("#pagination");
const boardTabs      = document.querySelectorAll("[data-board]");
const boardDescription = document.querySelector("#boardDescription");
const searchInput    = document.querySelector("#searchInput");
const postDetail     = document.querySelector("#postDetail");
const commentList    = document.querySelector("#commentList");
const commentInput   = document.querySelector("#commentInput");
const editorModeLabel= document.querySelector("#editorModeLabel");
const editorTitle    = document.querySelector("#editorTitle");
const postBoardLabel = document.querySelector("#postBoardLabel");
const postBoardSelect= document.querySelector("#postBoardSelect");
const postTitleInput = document.querySelector("#postTitleInput");
const postBodyInput  = document.querySelector("#postBodyInput");
const postImageInput = document.querySelector("#postImageInput");
const imagePreview   = document.querySelector("#imagePreview");
const clearImagesButton = document.querySelector("#clearImagesButton");
const mediaViewer    = document.querySelector("#mediaViewer");
const mediaViewerContent = document.querySelector("#mediaViewerContent");
const closeMediaViewerButton = document.querySelector("#closeMediaViewerButton");
const duplicateResult = document.querySelector("#duplicateResult");
const signupId       = document.querySelector("#signupId");
const profileTitle   = document.querySelector("#profileTitle");
const profileContent = document.querySelector("#profileContent");
const profileTabs    = document.querySelectorAll("[data-profile-tab]");
const adminUsersTab  = document.querySelector("#adminUsersTab");

// ─── 이벤트: 전역 클릭 위임 ────────────────────────────────────────────────────
document.addEventListener("click", async (event) => {
  const adminDeleteUserButton = event.target.closest("[data-admin-delete-user]");
  if (adminDeleteUserButton) {
    await removeUser(adminDeleteUserButton.dataset.adminDeleteUser);
    return;
  }

  const deleteCommentButton = event.target.closest("[data-delete-comment-id]");
  if (deleteCommentButton) {
    await deleteComment(deleteCommentButton.dataset.deleteCommentId);
    return;
  }

  const userButton = event.target.closest("[data-user-id]");
  if (userButton) {
    if (!requireLogin()) return;
    profileUserId = userButton.dataset.userId;
    activeProfileTab = "posts";
    navigate("mypage");
    return;
  }

  const routeButton = event.target.closest("[data-route]");
  if (!routeButton) return;
  if (routeButton.id === "myPageNavButton") {
    profileUserId = currentUser?.id ?? null;
    activeProfileTab = "posts";
  }
  navigate(routeButton.dataset.route);
});

// ─── 이벤트: 헤더 버튼 ─────────────────────────────────────────────────────────
writeNavButton.addEventListener("click", () => {
  if (!requireLogin()) return;
  openEditor();
});

logoutButton.addEventListener("click", async () => {
  await db.auth.signOut();
  currentUser = null;
  selectedPostId = null;
  showNotice("로그아웃되었습니다.");
  renderSession();
  navigate("home");
});

// ─── 이벤트: 검색 · 탭 ─────────────────────────────────────────────────────────
searchInput.addEventListener("input", () => {
  currentPage = 1;
  renderPosts();
});

boardTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeBoard = tab.dataset.board;
    currentPage = 1;
    renderPosts();
  });
});

profileTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeProfileTab = tab.dataset.profileTab;
    if (activeProfileTab === "adminUsers" && !canViewMemberManagement()) {
      activeProfileTab = "posts";
    }
    renderProfile();
  });
});

// ─── 이벤트: 이미지 업로드 ─────────────────────────────────────────────────────
postImageInput.addEventListener("change", async () => {
  try {
    selectedPostImages = await readImageFiles(postImageInput.files);
    renderImagePreview();
  } catch (error) {
    postImageInput.value = "";
    showNotice(error.message);
  }
});

clearImagesButton.addEventListener("click", () => {
  selectedPostImages = [];
  postImageInput.value = "";
  renderImagePreview();
});

// ─── 이벤트: 미디어 뷰어 ───────────────────────────────────────────────────────
closeMediaViewerButton.addEventListener("click", closeMediaViewer);
mediaViewer.addEventListener("click", (e) => { if (e.target === mediaViewer) closeMediaViewer(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !mediaViewer.classList.contains("hidden")) closeMediaViewer();
});

// ─── 이벤트: 미디어 원본 보기 ──────────────────────────────────────────────────
document.addEventListener("click", (event) => {
  const mediaButton = event.target.closest("[data-media-src]");
  if (!mediaButton) return;
  openMediaViewer({
    src: mediaButton.dataset.mediaSrc,
    name: mediaButton.dataset.mediaName,
    type: mediaButton.dataset.mediaType,
  });
});

// ─── 이벤트: ID 중복 확인 ──────────────────────────────────────────────────────
document.querySelector("#checkDuplicateButton").addEventListener("click", async () => {
  const username = signupId.value.trim();
  duplicateCheckedId = "";
  duplicateResult.className = "input-message";

  if (!username) {
    duplicateResult.textContent = "ID를 입력한 뒤 중복 확인을 해주세요.";
    duplicateResult.classList.add("error");
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
  duplicateResult.textContent = "ID는 영어, 숫자, 언더바(_)만 사용할 수 있습니다.";
  duplicateResult.classList.add("error");
  return;
}
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
  showNotice("ID는 영어, 숫자, 언더바(_)만 사용할 수 있습니다.");
  return;
}
  const { data, error } = await db
    .from("profiles")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    duplicateResult.textContent = "중복 확인 중 오류가 발생했습니다.";
    duplicateResult.classList.add("error");
    return;
  }

  if (data) {
    duplicateResult.textContent = "이미 사용 중인 ID입니다.";
    duplicateResult.classList.add("error");
    return;
  }

  duplicateCheckedId = username;
  duplicateResult.textContent = "사용 가능한 ID입니다.";
  duplicateResult.classList.add("ok");
});

signupId.addEventListener("input", () => {
  duplicateCheckedId = "";
  duplicateResult.className = "input-message";
  duplicateResult.textContent = "ID 중복 확인이 필요합니다.";
});

// ─── 이벤트: 회원가입 ──────────────────────────────────────────────────────────
document.querySelector("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = signupId.value.trim();
  const password = document.querySelector("#signupPassword").value;

  if (duplicateCheckedId !== username) {
    showNotice("회원가입 전 ID 중복 확인이 필요합니다.");
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showNotice("ID는 영어, 숫자, 언더바(_)만 사용할 수 있습니다.");
    return;
  }

  if (!/^[a-zA-Z0-9!@#$%^&*]+$/.test(password)) {
    showNotice("비밀번호는 영어, 숫자, 특수문자(!@#$%^&*)만 사용할 수 있습니다.");
    return;
  }

  showNotice("처리 중입니다...");

  const fakeEmail = `${username}@board.local`;
  const { data: signUpData, error: signUpError } = await db.auth.signUp({
    email: fakeEmail,
    password,
  });

  if (signUpError) {
    showNotice("회원가입 실패: " + signUpError.message);
    return;
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    showNotice("회원가입 중 오류가 발생했습니다.");
    return;
  }

  const { error: profileError } = await db
    .from("profiles")
    .insert({ id: userId, username });

  if (profileError) {
    showNotice("프로필 생성 실패: " + profileError.message);
    return;
  }

  currentUser = { id: userId, username, role: "member" };
  event.target.reset();
  duplicateCheckedId = "";
  showNotice("회원가입이 완료되었습니다.");
  renderSession();
  navigate("home");
});
// ─── 이벤트: 로그인 ────────────────────────────────────────────────────────────
document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.querySelector("#loginId").value.trim();
  const password = document.querySelector("#loginPassword").value;

  showNotice("처리 중입니다...");

  const fakeEmail = `${username}@board.local`;
  const { data, error } = await db.auth.signInWithPassword({ email: fakeEmail, password });

  if (error) {
    showNotice("ID 또는 PASSWORD가 올바르지 않습니다.");
    return;
  }

  const profile = await fetchProfile(data.user.id);
  if (!profile) {
    showNotice("프로필 정보를 불러오지 못했습니다.");
    return;
  }

  currentUser = { id: data.user.id, username: profile.username, role: profile.role };
  event.target.reset();
  showNotice("로그인되었습니다.");
  renderSession();
  navigate("home");
});

// ─── 이벤트: 글 작성 / 수정 ────────────────────────────────────────────────────
document.querySelector("#postForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;

  const title = postTitleInput.value.trim();
  const body  = postBodyInput.value.trim();
  if (!title || !body) {
    showNotice("제목과 내용을 모두 입력해주세요.");
    return;
  }

  showNotice("처리 중입니다...");

  if (editingPostId) {
    // ── 수정 ──
    const { data: existing } = await db
      .from("posts")
      .select("author_id, board")
      .eq("id", editingPostId)
      .single();

    if (!existing || existing.author_id !== currentUser.id) {
      showNotice("자신이 작성한 게시글만 수정할 수 있습니다.");
      navigate("home");
      return;
    }

    const board = isAdmin() ? postBoardSelect.value : existing.board;
    const { error } = await db
      .from("posts")
      .update({
        title,
        body,
        images: selectedPostImages,
        board,
        edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingPostId);

    if (error) { showNotice("게시글 수정 실패: " + error.message); return; }

    selectedPostId = editingPostId;
    showNotice("게시글이 수정되었습니다.");

  } else {
    // ── 신규 작성 ──
    const board = isAdmin() ? postBoardSelect.value : "free";
    const { data, error } = await db
      .from("posts")
      .insert({
        author_id: currentUser.id,
        title,
        body,
        board,
        images: selectedPostImages,
      })
      .select("id")
      .single();

    if (error) { showNotice("게시글 작성 실패: " + error.message); return; }

    selectedPostId = data.id;
    showNotice("게시글이 작성되었습니다.");
  }

  editingPostId = null;
  event.target.reset();
  selectedPostImages = [];
  renderImagePreview();
  navigate("detail");
});

// ─── 이벤트: 댓글 작성 ─────────────────────────────────────────────────────────
document.querySelector("#commentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;

  const body = commentInput.value.trim();
  if (!body || !selectedPostId) return;

  const { error } = await db
    .from("comments")
    .insert({ post_id: selectedPostId, author_id: currentUser.id, body });

  if (error) { showNotice("댓글 작성 실패: " + error.message); return; }

  commentInput.value = "";
  await renderDetail();
});

// ─── 라우팅 ────────────────────────────────────────────────────────────────────
function navigate(route) {
  if (route === "write" && !requireLogin()) return;
  if (route === "mypage") {
    if (!requireLogin()) return;
    profileUserId = profileUserId || currentUser?.id;
  }
  currentRoute = route;
  Object.values(views).forEach((v) => v.classList.add("hidden"));
  views[route].classList.remove("hidden");
  render();
}

function openEditor(postId = null) {
  editingPostId = postId;

  editorModeLabel.textContent = postId ? "글 수정" : "글 작성";
  editorTitle.textContent     = postId ? "게시글 수정" : "게시글 작성";
  postBoardLabel.classList.toggle("hidden", !isAdmin());

  if (postId) {
    // 수정 시: Supabase에서 기존 데이터 불러오기
    db.from("posts").select("*").eq("id", postId).single().then(({ data: post }) => {
      if (!post) return;
      postBoardSelect.value    = post.board;
      postTitleInput.value     = post.title;
      postBodyInput.value      = post.body;
      selectedPostImages       = Array.isArray(post.images) ? [...post.images] : [];
      renderImagePreview();
    });
  } else {
    postBoardSelect.value = activeBoard === "notice" ? "notice" : "free";
    postTitleInput.value  = "";
    postBodyInput.value   = "";
    selectedPostImages    = [];
    postImageInput.value  = "";
    renderImagePreview();
  }

  navigate("write");
}

// ─── 렌더링: 공통 ──────────────────────────────────────────────────────────────
function render() {
  renderSession();
  if (currentRoute === "home")   renderPosts();
  if (currentRoute === "detail") renderDetail();
  if (currentRoute === "mypage") renderProfile();
}

function renderSession() {
  const isLoggedIn = Boolean(currentUser);
  sessionStatus.textContent = isLoggedIn ? `${currentUser.username} 로그인 중` : "로그인 전";
  loginNavButton.classList.toggle("hidden", isLoggedIn);
  myPageNavButton.classList.toggle("hidden", !isLoggedIn);
  logoutButton.classList.toggle("hidden", !isLoggedIn);
}

// ─── 렌더링: 게시글 목록 ───────────────────────────────────────────────────────
async function renderPosts() {
  boardTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.board === activeBoard));
  boardDescription.textContent = getBoardDescription(activeBoard);
  postList.innerHTML = `<div class="empty-state">불러오는 중...</div>`;

  const query = searchInput.value.trim().toLowerCase();

  try {
    // 공지 글 (최신 PINNED_NOTICE_LIMIT 개)
    let noticeQuery = db
      .from("posts")
      .select(`id, title, board, edited, created_at, updated_at,
               author:profiles!author_id(id, username),
               likes:post_likes(count),
               comments:comments(count),
               views:post_views(count)`)
      .eq("board", "notice")
      .order("created_at", { ascending: false })
      .limit(PINNED_NOTICE_LIMIT);

    // 자유 글
    let freeQuery = db
      .from("posts")
      .select(`id, title, board, edited, created_at, updated_at,
               author:profiles!author_id(id, username),
               likes:post_likes(count),
               comments:comments(count),
               views:post_views(count)`)
      .eq("board", "free")
      .order("created_at", { ascending: false });

    if (query) {
      const like = `%${query}%`;
      noticeQuery = noticeQuery.or(`title.ilike.${like},body.ilike.${like}`);
      freeQuery   = freeQuery.or(`title.ilike.${like},body.ilike.${like}`);
    }

    let noticePosts = [];
    let freePosts   = [];

    if (activeBoard === "all" || activeBoard === "notice") {
      const { data, error } = await noticeQuery;
      if (error) throw error;
      noticePosts = data || [];
    }

    if (activeBoard === "all" || activeBoard === "free") {
      const { data, error } = await freeQuery;
      if (error) throw error;
      freePosts = data || [];
    }

    // 전체 게시판: 공지 고정 + 자유글 페이징
    let pinnedPosts = [];
    let pagedPosts  = [];
    let totalPages  = 1;

    if (activeBoard === "all") {
      pinnedPosts = noticePosts;
      const pageSize = Math.max(1, PAGE_SIZE - pinnedPosts.length);
      totalPages  = Math.max(1, Math.ceil(freePosts.length / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;
      pagedPosts  = freePosts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    } else if (activeBoard === "notice") {
      totalPages = Math.max(1, Math.ceil(noticePosts.length / PAGE_SIZE));
      if (currentPage > totalPages) currentPage = totalPages;
      pagedPosts = noticePosts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    } else {
      totalPages = Math.max(1, Math.ceil(freePosts.length / PAGE_SIZE));
      if (currentPage > totalPages) currentPage = totalPages;
      pagedPosts = freePosts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    }

    const allPosts = [...pinnedPosts, ...pagedPosts];

    if (!allPosts.length) {
      postList.innerHTML = `<div class="empty-state">게시글이 없습니다.</div>`;
      pagination.innerHTML = "";
      return;
    }

    postList.innerHTML = allPosts.map((post) => {
      const likeCount    = post.likes?.[0]?.count ?? 0;
      const commentCount = post.comments?.[0]?.count ?? 0;
      const viewCount    = post.views?.[0]?.count ?? 0;
      const noticeBadge  = post.board === "notice" ? `<span class="notice-badge">공지</span>` : "";

      return `
        <article class="post-card ${post.board === "notice" ? "notice-post" : ""}"
                 data-post-id="${escapeAttr(post.id)}" tabindex="0" role="button">
          <h2>${noticeBadge}${escapeHtml(post.title)}</h2>
          ${post.edited ? `<p class="edited-label">수정된 게시글입니다.</p>` : ""}
          <div class="meta-row">
            <span>작성자 ${authorButton(post.author.id, post.author.username)}</span>
            <span>${formatDate(post.created_at)}</span>
            <span>댓글 ${commentCount}</span>
            <span>좋아요 ${likeCount}</span>
            <span>조회 ${viewCount}</span>
          </div>
        </article>
      `;
    }).join("");

    postList.querySelectorAll("[data-post-id]").forEach((card) => {
      const handler = async (event) => {
        if (event.target.closest("[data-user-id]")) return;
        if (!requireLogin()) return;
        selectedPostId = card.dataset.postId;
        await increaseViewCount(selectedPostId);
        navigate("detail");
      };
      card.addEventListener("click", handler);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(e); }
      });
    });

    renderPagination(totalPages);

  } catch (err) {
    postList.innerHTML = `<div class="empty-state">게시글을 불러오지 못했습니다.</div>`;
    console.error(err);
  }
}

// ─── 렌더링: 게시글 상세 ───────────────────────────────────────────────────────
async function renderDetail() {
  if (!selectedPostId) { navigate("home"); return; }

  postDetail.innerHTML = `<p>불러오는 중...</p>`;
  commentList.innerHTML = "";

  const { data: post, error } = await db
    .from("posts")
    .select(`*, author:profiles!author_id(id, username)`)
    .eq("id", selectedPostId)
    .single();

  if (error || !post) {
    showNotice("게시글을 찾을 수 없습니다.");
    navigate("home");
    return;
  }

  // 좋아요 수 & 내가 좋아요 했는지
  const [{ count: likeCount }, likedRow] = await Promise.all([
    db.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", post.id),
    currentUser
      ? db.from("post_likes").select("post_id").eq("post_id", post.id).eq("user_id", currentUser.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const hasLiked  = Boolean(likedRow.data);
  const isOwner   = currentUser?.id === post.author_id;
  const canManage = isOwner || isAdmin();

  postDetail.innerHTML = `
    <h1 class="detail-title">${escapeHtml(post.title)}</h1>
    ${post.edited ? `<p class="edited-label">수정된 게시글입니다.</p>` : ""}
    <div class="meta-row">
      <span>작성자 ${authorButton(post.author.id, post.author.username)}</span>
      <span>${post.board === "notice" ? "공지게시판" : "자유게시판"}</span>
      <span>작성 ${formatDate(post.created_at)}</span>
      ${post.updated_at ? `<span>수정 ${formatDate(post.updated_at)}</span>` : ""}
    </div>
    <p class="detail-body">${escapeHtml(post.body)}</p>
    ${renderPostImages(Array.isArray(post.images) ? post.images : [])}
    <div class="owner-actions">
      <button id="likeButton" class="ghost-button like-button ${hasLiked ? "active" : ""}" type="button">
        좋아요 ${likeCount ?? 0}
      </button>
      ${isOwner  ? `<button id="editPostButton" class="ghost-button" type="button">수정</button>` : ""}
      ${canManage ? `<button id="deletePostButton" class="ghost-button danger-button" type="button">삭제</button>` : ""}
    </div>
  `;

  document.querySelector("#likeButton").addEventListener("click", toggleLike);
  document.querySelector("#editPostButton")?.addEventListener("click", () => openEditor(post.id));
  document.querySelector("#deletePostButton")?.addEventListener("click", deletePost);

  await renderComments();
}

async function renderComments() {
  const { data: comments, error } = await db
    .from("comments")
    .select(`*, author:profiles!author_id(id, username)`)
    .eq("post_id", selectedPostId)
    .order("created_at", { ascending: true });

  if (error || !comments?.length) {
    commentList.innerHTML = `<div class="empty-state">등록된 댓글이 없습니다.</div>`;
    return;
  }

  commentList.innerHTML = comments.map((comment) => `
    <article class="comment-item">
      <p>${escapeHtml(comment.body)}</p>
      <div class="meta-row">
        <span>작성자 ${authorButton(comment.author.id, comment.author.username)}</span>
        <span>${formatDate(comment.created_at)}</span>
        ${(isAdmin() || currentUser?.id === comment.author_id)
          ? `<button class="text-button danger-text" type="button" data-delete-comment-id="${escapeAttr(comment.id)}">댓글 삭제</button>`
          : ""}
      </div>
    </article>
  `).join("");
}

// ─── 액션: 좋아요 토글 ─────────────────────────────────────────────────────────
async function toggleLike() {
  if (!requireLogin()) return;

  const { data: post } = await db.from("posts").select("author_id").eq("id", selectedPostId).single();
  if (post?.author_id === currentUser.id) {
    showNotice("타인이 작성한 게시글에만 좋아요를 남길 수 있습니다.");
    return;
  }

  const { data: existing } = await db
    .from("post_likes")
    .select("post_id")
    .eq("post_id", selectedPostId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (existing) {
    await db.from("post_likes").delete().eq("post_id", selectedPostId).eq("user_id", currentUser.id);
  } else {
    await db.from("post_likes").insert({ post_id: selectedPostId, user_id: currentUser.id });
  }

  await renderDetail();
}

// ─── 액션: 조회수 증가 ─────────────────────────────────────────────────────────
async function increaseViewCount(postId) {
  if (!currentUser) return;
  // upsert: 이미 조회한 경우 무시
  await db.from("post_views").upsert(
    { post_id: postId, user_id: currentUser.id },
    { onConflict: "post_id,user_id", ignoreDuplicates: true }
  );
}

// ─── 액션: 게시글 삭제 ─────────────────────────────────────────────────────────
async function deletePost() {
  if (!window.confirm("삭제된 게시물은 복구할 수 없습니다. 삭제하시겠습니까?")) return;

  const { error } = await db.from("posts").delete().eq("id", selectedPostId);
  if (error) { showNotice("삭제 실패: " + error.message); return; }

  selectedPostId = null;
  showNotice("게시글이 삭제되었습니다.");
  navigate("home");
}

// ─── 액션: 댓글 삭제 ───────────────────────────────────────────────────────────
async function deleteComment(commentId) {
  if (!isAdmin() && currentUser?.id !== commentId) {
    // author 체크는 RLS가 처리
  }
  const { error } = await db.from("comments").delete().eq("id", commentId);
  if (error) { showNotice("댓글 삭제 실패: " + error.message); return; }
  showNotice("댓글이 삭제되었습니다.");
  await renderDetail();
}

// ─── 렌더링: 마이페이지 ────────────────────────────────────────────────────────
async function renderProfile() {
  const userId    = profileUserId || currentUser?.id;
  const isMine    = userId === currentUser?.id;
  const canManage = canViewMemberManagement();

  // username 조회
  const profile = await fetchProfile(userId);
  profileTitle.textContent = isMine ? "내 활동 내역" : `${profile?.username ?? ""} 활동 내역`;
  document.querySelector("#settingsNavButton").classList.toggle("hidden", !isMine);
  adminUsersTab.classList.toggle("hidden", !canManage);

  if (activeProfileTab === "adminUsers" && !canManage) activeProfileTab = "posts";

  profileTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.profileTab === activeProfileTab);
  });

  if (activeProfileTab === "adminUsers") { await renderMemberManagement(); return; }

  profileContent.innerHTML = `<div class="empty-state">불러오는 중...</div>`;

  let posts = [];

  if (activeProfileTab === "posts") {
    const { data } = await db
      .from("posts")
      .select(`id, title, board, created_at,
               likes:post_likes(count),
               comments:comments(count),
               views:post_views(count)`)
      .eq("author_id", userId)
      .order("created_at", { ascending: false });
    posts = (data || []).map((p) => ({ post: p, note: "작성한 글" }));
  }

  if (activeProfileTab === "likes") {
    const { data } = await db
      .from("post_likes")
      .select(`post:posts(id, title, board, created_at, author_id,
                 likes:post_likes(count),
                 comments:comments(count),
                 views:post_views(count))`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    posts = (data || []).map((row) => ({ post: row.post, note: "좋아요 누른 글" }));
  }

  if (activeProfileTab === "comments") {
    const { data } = await db
      .from("comments")
      .select(`body, post:posts(id, title, board, created_at, author_id,
                 likes:post_likes(count),
                 comments:comments(count),
                 views:post_views(count))`)
      .eq("author_id", userId)
      .order("created_at", { ascending: false });

    // 같은 post에 여러 댓글 → 게시글 단위로 합치기
    const map = new Map();
    (data || []).forEach((row) => {
      const pid = row.post.id;
      if (!map.has(pid)) map.set(pid, { post: row.post, bodies: [] });
      map.get(pid).bodies.push(row.body);
    });
    posts = [...map.values()].map(({ post, bodies }) => ({
      post,
      note: `댓글 ${bodies.length}개: ${bodies.join(" / ")}`,
    }));
  }

  if (!posts.length) {
    profileContent.innerHTML = `<div class="empty-state">표시할 활동이 없습니다.</div>`;
    return;
  }

  profileContent.innerHTML = posts.map(({ post, note }) => {
    const likeCount    = post.likes?.[0]?.count ?? 0;
    const commentCount = post.comments?.[0]?.count ?? 0;
    const viewCount    = post.views?.[0]?.count ?? 0;
    return `
      <button class="profile-item" type="button" data-post-id="${escapeAttr(post.id)}">
        <span class="profile-item-title">${escapeHtml(post.title)}</span>
        <span class="profile-item-note">${escapeHtml(note)}</span>
        <span class="profile-item-meta">댓글 ${commentCount} · 좋아요 ${likeCount} · 조회 ${viewCount}</span>
      </button>
    `;
  }).join("");

  profileContent.querySelectorAll("[data-post-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedPostId = btn.dataset.postId;
      await increaseViewCount(selectedPostId);
      navigate("detail");
    });
  });
}

// ─── 렌더링: 회원 관리 (관리자) ────────────────────────────────────────────────
async function renderMemberManagement() {
  if (!canViewMemberManagement()) {
    profileContent.innerHTML = `<div class="empty-state">회원 관리는 관리자 본인 마이페이지에서만 확인할 수 있습니다.</div>`;
    return;
  }

  profileContent.innerHTML = `<div class="empty-state">불러오는 중...</div>`;

  // 현재 로그인된 관리자 제외한 전체 회원
  const { data: users, error } = await db
    .from("profiles")
    .select("id, username, role, created_at")
    .neq("id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error || !users?.length) {
    profileContent.innerHTML = `<div class="empty-state">가입된 회원이 없습니다.</div>`;
    return;
  }

  // 각 회원의 게시글·댓글 수
  const [{ data: postCounts }, { data: commentCounts }] = await Promise.all([
    db.from("posts").select("author_id").in("author_id", users.map((u) => u.id)),
    db.from("comments").select("author_id").in("author_id", users.map((u) => u.id)),
  ]);

  profileContent.innerHTML = `<div class="admin-user-list">${users.map((user) => {
    const postCount    = postCounts?.filter((p) => p.author_id === user.id).length ?? 0;
    const commentCount = commentCounts?.filter((c) => c.author_id === user.id).length ?? 0;
    return `
      <div class="admin-user-item">
        <div>
          <strong>${escapeHtml(user.username)}</strong>
          <p>가입 ${formatDate(user.created_at)} · 게시글 ${postCount}개 · 댓글 ${commentCount}개</p>
        </div>
        <button class="ghost-button danger-button" type="button"
                data-admin-delete-user="${escapeAttr(user.id)}">강제탈퇴</button>
      </div>
    `;
  }).join("")}</div>`;
}

// ─── 액션: 회원 강제탈퇴 (관리자) ─────────────────────────────────────────────
async function removeUser(userId) {
  if (!isAdmin()) return;

  const { data: profile } = await fetchProfileRaw(userId);
  const username = profile?.username ?? userId;

  if (!window.confirm(`${username} 회원을 강제탈퇴 시키겠습니까? 작성한 글과 댓글도 삭제됩니다.`)) return;

  // posts, comments는 CASCADE로 자동 삭제됨 (스키마 참조)
  // profiles 삭제 → auth.users CASCADE 삭제
  const { error } = await db.from("profiles").delete().eq("id", userId);
  if (error) { showNotice("강제탈퇴 실패: " + error.message); return; }

  showNotice("회원이 강제탈퇴되었습니다.");
  await renderMemberManagement();
}

// ─── 렌더링: 페이지네이션 ──────────────────────────────────────────────────────
function renderPagination(totalPages) {
  if (totalPages <= 1) { pagination.innerHTML = ""; return; }

  pagination.innerHTML = Array.from({ length: totalPages }, (_, i) => {
    const page = i + 1;
    return `<button class="page-button ${page === currentPage ? "active" : ""}" type="button" data-page="${page}">${page}</button>`;
  }).join("") +
  `<button class="page-button" type="button" data-page-next ${currentPage >= totalPages ? "disabled" : ""}>다음</button>`;

  pagination.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => { currentPage = Number(btn.dataset.page); renderPosts(); });
  });

  pagination.querySelector("[data-page-next]")?.addEventListener("click", () => {
    if (currentPage >= totalPages) return;
    currentPage += 1;
    renderPosts();
  });
}

// ─── 렌더링: 이미지 ────────────────────────────────────────────────────────────
function renderImagePreview() {
  if (!selectedPostImages.length) {
    imagePreview.innerHTML = `<p class="image-empty">선택된 이미지가 없습니다.</p>`;
    return;
  }
  imagePreview.innerHTML = selectedPostImages.map((image) => `
    <figure class="image-thumb">
      ${renderMediaElement(image, "preview")}
      <figcaption>${escapeHtml(image.name)}</figcaption>
    </figure>
  `).join("");
}

function renderPostImages(images) {
  if (!images.length) return "";
  return `
    <div class="post-images">
      ${images.map((image) => `
        <button class="post-image" type="button"
                data-media-src="${escapeAttr(image.src)}"
                data-media-name="${escapeAttr(image.name)}"
                data-media-type="${escapeAttr(image.type || "image/*")}">
          ${renderMediaElement(image, "detail")}
          <span class="media-open-label">원본 보기</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMediaElement(media, mode) {
  if ((media.type || "").startsWith("video/")) {
    return `<video src="${escapeAttr(media.src)}" muted preload="metadata"></video>`;
  }
  return `<img src="${escapeAttr(media.src)}" alt="${escapeAttr(media.name)}" />`;
}

function openMediaViewer(media) {
  const isVideo = (media.type || "").startsWith("video/");
  mediaViewerContent.innerHTML = isVideo
    ? `<video class="media-original" src="${escapeAttr(media.src)}" controls autoplay></video>`
    : `<img class="media-original" src="${escapeAttr(media.src)}" alt="${escapeAttr(media.name)}" />`;
  mediaViewer.classList.remove("hidden");
}

function closeMediaViewer() {
  mediaViewer.classList.add("hidden");
  mediaViewerContent.innerHTML = "";
}

// ─── 유틸: Supabase helpers ────────────────────────────────────────────────────
async function fetchProfile(userId) {
  if (!userId) return null;
  const { data } = await db.from("profiles").select("id, username, role").eq("id", userId).single();
  return data;
}

async function fetchProfileRaw(userId) {
  return db.from("profiles").select("id, username, role").eq("id", userId).single();
}

// ─── 유틸: 권한 ────────────────────────────────────────────────────────────────
function isAdmin() {
  return currentUser?.role === "admin";
}

function canViewMemberManagement() {
  return isAdmin() && (profileUserId === currentUser?.id || !profileUserId);
}

function requireLogin() {
  if (currentUser) return true;
  window.alert("로그인이 필요한 기능입니다.");
  showNotice("로그인이 필요한 기능입니다.");
  navigate("login");
  return false;
}

// ─── 유틸: UI ──────────────────────────────────────────────────────────────────
function showNotice(message) {
  notice.textContent = message;
  notice.classList.remove("hidden");
  window.setTimeout(() => notice.classList.add("hidden"), 3200);
}

function getBoardDescription(board) {
  if (board === "notice") return "공지를 작성할 수 있습니다. 공지 게시글은 관리자만 작성 가능합니다.";
  if (board === "free")   return "자유게시판입니다.";
  return "전체게시판입니다. 최신 공지 2개와 자유게시글을 함께 확인할 수 있습니다.";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function authorButton(userId, username) {
  return `<button class="text-button author-link" type="button" data-user-id="${escapeAttr(userId)}">${escapeHtml(username)}</button>`;
}

// ─── 유틸: 이미지 파일 읽기 ────────────────────────────────────────────────────
function readImageFiles(files) {
  const arr = Array.from(files || []);
  if (arr.length > MAX_IMAGE_COUNT)
    return Promise.reject(new Error(`이미지는 최대 ${MAX_IMAGE_COUNT}개까지 업로드할 수 있습니다.`));
  const invalid = arr.find((f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"));
  if (invalid)
    return Promise.reject(new Error("이미지 또는 동영상 파일만 업로드할 수 있습니다."));
  const oversized = arr.find((f) => f.size > MAX_IMAGE_SIZE);
  if (oversized)
    return Promise.reject(new Error("파일당 8MB 이하만 업로드할 수 있습니다."));

  return Promise.all(arr.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, src: reader.result, type: file.type });
    reader.onerror = () => reject(new Error("이미지를 읽는 중 오류가 발생했습니다."));
    reader.readAsDataURL(file);
  })));
}

// ─── 앱 초기화 ─────────────────────────────────────────────────────────────────
async function init() {
  // 기존 세션 복원 (페이지 새로고침 시 로그인 유지)
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    const profile = await fetchProfile(session.user.id);
    if (profile) {
      currentUser = { id: session.user.id, username: profile.username, role: profile.role };
    }
  }

  // 세션 변화 감지 (탭 간 로그인/로그아웃 동기화)
  db.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      const profile = await fetchProfile(session.user.id);
      if (profile) currentUser = { id: session.user.id, username: profile.username, role: profile.role };
    } else {
      currentUser = null;
    }
    renderSession();
  });

  render();
}

// ─── 비밀번호 표시/숨기기 ──────────────────────────────────────────────────────
document.querySelector("#toggleLoginPassword").addEventListener("click", () => {
  const input = document.querySelector("#loginPassword");
  input.type = input.type === "password" ? "text" : "password";
});

document.querySelector("#toggleSignupPassword").addEventListener("click", () => {
  const input = document.querySelector("#signupPassword");
  input.type = input.type === "password" ? "text" : "password";
});

// ─── 설정 뷰 ───────────────────────────────────────────────────────────────────
views.settings = document.querySelector("#settingsView");

document.querySelector("#toggleCurrentPassword").addEventListener("click", () => {
  const input = document.querySelector("#currentPassword");
  input.type = input.type === "password" ? "text" : "password";
});

document.querySelector("#toggleNewPassword").addEventListener("click", () => {
  const input = document.querySelector("#newPassword");
  input.type = input.type === "password" ? "text" : "password";
});

document.querySelector("#changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;

  const currentPassword = document.querySelector("#currentPassword").value;
  const newPassword = document.querySelector("#newPassword").value;

  // 현재 비밀번호 확인 (재로그인으로 검증)
  const fakeEmail = `${currentUser.username}@board.local`;
  const { error: verifyError } = await db.auth.signInWithPassword({
    email: fakeEmail,
    password: currentPassword,
  });

  if (verifyError) {
    showNotice("현재 비밀번호가 올바르지 않습니다.");
    return;
  }

  // 새 비밀번호로 변경
  const { error } = await db.auth.updateUser({ password: newPassword });
  if (error) {
    showNotice("비밀번호 변경 실패: " + error.message);
    return;
  }

  event.target.reset();
  showNotice("비밀번호가 변경되었습니다.");
  navigate("mypage");
});

init();