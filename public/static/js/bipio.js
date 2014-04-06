$(document).ready(function() {

    $('#sign-in-submit').click(function() {
        var self = $('#sign-in-submit');
        payload = {
              'username' : $('#login_username').val(),
              'password' : $('#login_password').val()
            };

            var reqStruct = {
                type: 'POST',
                contentType: 'application/json',
                dataType: 'json',
                data: JSON.stringify(payload),
                url: '/auth',
                success: function(resData, status, xhr) {
                    window.location.replace('/dash');
                },
                error: function(xhr, status, errText) {
                    self.removeClass('btn-success').addClass('btn-danger').html('Please Retry');
                    $("#login_username").focus();
                }
            };

            $.ajax(reqStruct);
    });

    $('#login_password').keyup(function (e) {
        e.preventDefault();
        if (e.which == 13) {
            $('#sign-in-submit').trigger('click');
        }
    });    
    
    $('#login_username').keyup(function (e) {
        e.preventDefault();
        if (e.which == 13) {
            $('#sign-in-submit').trigger('click');
        }
    });    
    
    $('#sign-in-btn').click(function(ev) {
        // bullshit.
        var x = setTimeout(function() {
                $("#login_username").focus()
            }, 100);
    });
    

    // fix sub nav on scroll
    /*
    var $win = $(window)
      , $nav = $('.subnav')
      , navTop = $('.subnav').length && $('.subnav').offset().top - 40
      , isFixed = 0;

    function processScroll() {
      var i, scrollTop = $win.scrollTop()
      if (scrollTop >= navTop && !isFixed) {
        isFixed = 1
        $nav.addClass('subnav-fixed');
        
      } else if (scrollTop <= navTop && isFixed) {
        isFixed = 0
        $nav.removeClass('subnav-fixed')
      }
    }

    processScroll();

    // hack sad times - holdover until rewrite for 2.1
    $nav.on('click', function () {
      if (!isFixed) setTimeout(function () {  $win.scrollTop($win.scrollTop() - 47) }, 10)
    })

    $win.on('scroll', processScroll);
    */
   
    // ---------- UI BEHAVIOURS---------------------

    $('.content-toggle-trigger').live({
        'click' : function(e) {
            var tag = $(this).prop('tagName'),
            target = $(this).attr('data-content-toggle');
            $(target).slideToggle();
            if(tag === 'a') return false;
        }
    });

/*
   $(document).keyup(function(e) {
        if (e.keyCode == 27) {  // ESC
            $('.modal-close').trigger('click');
            $('.date').datepicker('hide');
        }   
    });
    */


   $('.dropdown-toggle').dropdown();   
   
   // set up tabs
   $('#tabbable a').click(function (e) {
            e.preventDefault();
            $(this).tab('show');
          });
          
    $(".collapse").collapse();
   
});