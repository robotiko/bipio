require.config({
  baseUrl : "/static/js",
  paths: {
    jquery: 'vendor/jquery/jquery-min',
    jquery_b64 : 'vendor/jquery/jquery.base64.min',
    //bootstrap : 'vendor/bootstrap/bootstrap',
    bootstrap : 'vendor/bootstrap/bootstrap-bundle',
    underscore: 'vendor/underscore/underscore-min',
    backbone: 'vendor/backbone/backbone-min',
    sessionstorage: "vendor/backbone/backbone.sessionStorage",
    bipclient: 'client',
    c_domain : 'collections/domain/c_domain_all',
    c_channel : 'collections/channel/c_channel_all',
    c_channel_pod : 'collections/channel/c_pod_all',
    c_mount_local : 'collections/mount/c_mount_local',
    c_pod : 'collections/channel/c_pod_all',
    'd3' : 'vendor/d3/d3.min'
  },
  shim : {
    "backbone": {
      deps: ["underscore", "jquery"],
      exports: "Backbone"  //attaches "Backbone" to the window object
    },
    'bootstrap': [ 'jquery' ],
    "d3" : {
      exports : "d3"
    },
    "jquery_b64" : {
      deps : [ "jquery" ]
    }
  }
});

define([
  'underscore',
  'backbone',
  'bipclient',
  'views/account_option/v_account_option',
  'views/domain/v_domain_admin',
  'views/stats/v_stats',
  'views/mount/v_mount',
  'models/m_account_option',
  'c_domain',
  'c_channel',
  'c_mount_local',
  'c_pod',
  'bootstrap',
  ], function(_, Backbone, BipClient, AccountOptionView, DomainAdminView, 
  StatsView, MountsView, AccountOptionModel, DomainCollection, ChannelCollection, 
  MountLocalCollection, PodCollection) {
    
    var c_domain = new DomainCollection();
    BipClient.setCollection('domain', c_domain);

    var c_channel = new ChannelCollection();
    BipClient.setCollection('channel', c_channel);

    var c_pod = new PodCollection();
    BipClient.setCollection('pod', c_pod);

    var optionsView = new AccountOptionView({
      model : new AccountOptionModel(BipClient.getSettings())
    });

    var domainsView = new DomainAdminView({
      collection : c_domain
    });

    var statsView = new StatsView();

    var c_mounts_local = new MountLocalCollection();
    var mountsView = new MountsView({
      collection : c_mounts_local
    });

    BipClient.init().then(function() {
      $.when(
        c_channel.fetch({ reset : true }),
        c_pod.fetch(
        {
          success : function() {
            BipClient.decorateChannels();
          }
        })
      ).done(function() {
        $.when(        
          c_domain.fetch({ reset : true }), 
          c_mounts_local.fetch({ reset : true }) )
        .done(function() {
          $('#loader-wrapper').fadeOut(function() {
            $(this).remove();
          });
          optionsView.render();
          statsView.render();
          domainsView.render();
        });
      });
    });

    // UI
    $('.token_style').live('click', function() {
      // firefox
      if(document.createRange) {
        rangeToSelect = document.createRange();
        rangeToSelect.selectNode(this.firstChild);
        curSelect = window.getSelection();
        curSelect.addRange(rangeToSelect);
        return false;
      }
      // ie
      if(document.body &&
        document.body.createTextRange) {
        range = document.body.createTextRange();
        range.moveToElementText(this);
        range.select();
        return false;
      }
    });

    $('#token_view_token').click(function() {
      $('#token_token').css('display', 'inline');
      $('#token_auth').css('display', 'none');
    });

    $('#token_view_auth').click(function() {
      $('#token_auth').css('display', 'inline');
      $('#token_token').css('display', 'none');
    });
  });
