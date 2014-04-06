// Bootstrap Scripts
// @codekit-prepend 'vendor/bootstrap/bootstrap-transition.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-alert.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-modal.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-dropdown.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-scrollspy.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-tab.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-tooltip.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-popover.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-button.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-collapse.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-carousel.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-typeahead.js';
// @codekit-prepend 'vendor/bootstrap/bootstrap-affix.js';

// Plugins


(function($){
	$(document).ready(function(){
		$('.content-toggle-trigger').click(contentToggle);
		$('.modal-trigger').click(launchModal);
		$('.modal-close').click(closeModal);
	});
	
	function contentToggle(){
		var tag = $(this).prop('tagName'),
		target = $(this).attr('data-content-toggle');
		
		$(target).slideToggle();
		
		if(tag === 'a') return false;
	}
	
	function launchModal(e){
		e.preventDefault();
		var target = $(this).attr('data-modal');
		$(target).closest('.modal-overlay').fadeIn(600);
	}
	
	function closeModal(e){
		e.preventDefault();
		$(this).closest('.modal-overlay').fadeOut(600);
	}
})(jQuery);