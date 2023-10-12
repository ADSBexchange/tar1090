jQuery(document).ready(function () {
  jQuery("#feature_landings").tooltip(); //Init jquery tooltip just on flight activity blocks. 

  if (adsbexchange) {
    if (usp.has("icao")) { //This runs just if you pass an icao on page load.
      let icao = usp.get("icao");
      runAPI(icao, false, jQuery("#feature_landings"), function (data) { //Running the API and passing the display function in the callback.
        display_takeoffs_landings_home_block(
          data,
          jQuery("#takeoff_landings_block")
        );
      });

      if (localStorage.getItem("auto_play")) {
        localStorage.removeItem("auto_play");
        $('#t1x').click();
      }

      if (!returnCookie("adsbx_subscriber") || !returnCookie("adsbx_subscriber_exp")) {//If not a subscriber, disable the full details button and add a tooltip.
        jQuery(".full_detail").addClass("disabled");
        jQuery(".full_detail").tooltip({
          content: function () {
              return "We're excited to provide ADS-B Exchange's feeder network with early access to this new feature showing detailed aircraft and flight information.<br /><br />Don't want to wait? <a href='https://www.adsbexchange.com/ways-to-join-the-exchange/' target='_new'>Become a Feeder now</a>.";
          },
          show: null, 
          close: function (event, ui) {
              ui.tooltip.hover(
              function () {
                  $(this).stop(true).fadeTo(400, 1);
              },    
              function () {
                  $(this).fadeOut("400", function () {
                      $(this).remove();
                  })
              });
          }
      }); //Init jquery tooltip on the full details button so that it shows a message to non-subscribers.
      }
    }
  } else {
    jQuery("#feature_landings").hide();    //Close off features that need the API from sites not adsbexchange.
  }
});

const infoblockNode = document.querySelector("#selected_infoblock"); //Setting up a mutation for the selected infoblock.
let fullDetails = false;

const observer = new MutationObserver(function (mutationList, observer) { //Reset Function to run on change for mutation.
  resetFunction();
});

observer.observe(infoblockNode, { //Observing the mutation.
  attributes: true,
  characterData: true,
  childList: false,
  subtree: false,
  attributeOldValue: false,
  characterDataOldValue: false,
});

