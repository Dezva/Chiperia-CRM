// Guarda un mensaje visible como ancla, incluso al anteponer páginas del historial.
export function captureChatScroll(root){
 const list=root.querySelector('#messageList');
 if(!list)return null;
 const top=list.getBoundingClientRect().top;
 const anchor=[...list.querySelectorAll('[data-message-id]')].find(node=>node.getBoundingClientRect().bottom>top);
 return {id:list.dataset.conversationId,top:list.scrollTop,
  bottom:list.scrollHeight-list.clientHeight-list.scrollTop<24,
  anchor:anchor?.dataset.messageId,offset:anchor?anchor.getBoundingClientRect().top-top:0,
  sidebar:root.querySelector('.chat-list')?.scrollTop||0,
  sidebarLeft:root.querySelector('.chat-list')?.scrollLeft||0,
  aside:root.querySelector('.chat-aside')?.scrollTop||0};
}
export function restoreChatScroll(root,state){
 const list=root.querySelector('#messageList');
 if(!list)return;
 if(!state||state.id!==list.dataset.conversationId){list.scrollTop=list.scrollHeight;return;}
 const anchor=[...list.querySelectorAll('[data-message-id]')].find(node=>node.dataset.messageId===state.anchor);
 if(state.bottom)list.scrollTop=list.scrollHeight;
 else if(anchor)list.scrollTop+=anchor.getBoundingClientRect().top-list.getBoundingClientRect().top-state.offset;
 else list.scrollTop=state.top;
 const sidebar=root.querySelector('.chat-list'),aside=root.querySelector('.chat-aside');
 if(sidebar){sidebar.scrollTop=state.sidebar;sidebar.scrollLeft=state.sidebarLeft;}
 if(aside)aside.scrollTop=state.aside;
}
