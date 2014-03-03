/* ===================================================
 * bootstrap-tagmanager.js v2.4.2
 * http://welldonethings.com/tags/manager
 * ===================================================
 * Copyright 2012 Max Favilli
 *
 * Licensed under the Mozilla Public License, Version 2.0 You may not use this work except in compliance with the License.
 *
 * http://www.mozilla.org/MPL/2.0/
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ========================================================== */

(function($){

  "use strict";

  if (typeof console === "undefined" || typeof console.log === "undefined") {
    console = {};
    console.log = function () { };
  }

  $.fn.tagsManager = function (options,tagToManipulate) {
    var tagManagerOptions = {
      prefilled: null,
      CapitalizeFirstLetter: false,
      preventSubmitOnEnter: true, // deprecated
      isClearInputOnEsc: true, // deprecated
      typeahead: false,
      typeaheadAjaxMethod: "POST",
      typeaheadAjaxSource: null,
      typeaheadAjaxPolling: false,
      typeaheadOverrides: null,
      typeaheadDelegate: {},
      typeaheadSource: null,
      AjaxPush: null,
      AjaxPushAllTags: null,
      AjaxPushParameters: null,
      delimiters: [9,13,44], // tab, enter, comma
      backspace: [8],
      maxTags: 0,
      hiddenTagListName: null,
      hiddenTagListId: null,
      deleteTagsOnBackspace: true, // deprecated
      tagsContainer: null,
      tagCloseIcon: '×',
      tagClass: '',
      validator: null,
      onInvalid: null,
      onlyTagList: false,
      editable: true,
      collapseWhitespace: false
    };

    var TypeaheadOverrides = (function () {
      function TypeaheadOverrides() {
        this.instanceSelectHandler = null;
        this.selectedClass = "selected";
        this.select = null;
        if ("typeahead" in $.fn) {
          this.instanceSelectHandler = $.fn.typeahead.Constructor.prototype.select;
          this.select = function (overrides) {
            this.$menu.find(".active").addClass(overrides.selectedClass);
            overrides.instanceSelectHandler.apply(this, arguments);
          };
        }
      }
      return TypeaheadOverrides;
    })();

    // exit when no matched elements
    if (!(0 in this)) {
      return this;
    }

    tagManagerOptions.typeaheadOverrides = new TypeaheadOverrides();

    $.extend(tagManagerOptions, options);

    if (tagManagerOptions.hiddenTagListName === null) {
      tagManagerOptions.hiddenTagListName = "hidden-" + this.attr('name');
    }

    var obj = this;
    var objName = obj.attr('name').replace(/[^\w]/g, '_');
    var delimiters = tagManagerOptions.delimeters || tagManagerOptions.delimiters; // 'delimeter' is deprecated
    // delimiter values to be handled as key codes
    var keyNums = [9,13,17,18,19,37,38,39,40];
    var delimiterChars = [], delimiterKeys = [];
    $.each(delimiters, function(i,v){
      if ( $.inArray(v, keyNums) != -1 ){
        delimiterKeys.push(v);
      } else {
        delimiterChars.push(v);
      }
    });
    var baseDelimiter = String.fromCharCode(delimiterChars[0] || 44);
    var backspace = tagManagerOptions.backspace;
    var tagBaseClass = 'tm-tag';
    var inputBaseClass = 'tm-input';

    if (tagManagerOptions.validator != null) {
        obj.data('validator', tagManagerOptions.validator);
    }

    if (tagManagerOptions.onInvalid != null) {
        obj.data('onInvalid', tagManagerOptions.onInvalid);
    }

    if (!tagManagerOptions.editable) {
      obj.hide()
    }

    var setupTypeahead = function () {
        if (!obj.typeahead) return;

        var taOpts = tagManagerOptions.typeaheadDelegate;

        /*
        Set the updater function for typeahead, which is called
        when an item is selected, and is supposed to return the
        text to insert into the input field. Instead, we add a
        tag and clear the input. Because we hacked typeahead to
        start with nothing selected, item can be undefined, in
        which case we add the current input field text as a tag.
         */
        $.extend(taOpts, { updater: function(item) {
            if (item) {
                pushTag(item);
            } else {
                pushTag(obj.val());
            }
            return "";
        }});

        /*
        Intercept the TAB key BEFORE typeahead gets it, and check
        if something is selected. If not, select the first item,
        then let typeahead add it.
         */
        obj.on('keyup', function(event) {
            if (event.which == 9) {
                if (typeaheadVisible()) {
                    var ta = obj.data('typeahead');
                    if (ta.$menu.find('.active').length == 0)
                        ta.next();
                }
            }
        });

        if (tagManagerOptions.typeaheadSource != null && $.isFunction(tagManagerOptions.typeaheadSource)) {
            $.extend(taOpts, { source: typeaheadSource });
            obj.typeahead(taOpts);
        } else if (tagManagerOptions.typeaheadSource != null) {
            obj.typeahead(taOpts);
            setTypeaheadSource(tagManagerOptions.typeaheadSource);
        } else if (tagManagerOptions.typeaheadAjaxSource != null) {
            if (tagManagerOptions.typeaheadAjaxPolling) {
                $.extend(taOpts, { source: typeaheadAjaxSource });
                obj.typeahead(taOpts);
            } else {
                obj.typeahead(taOpts);

                if (typeof (tagManagerOptions.typeaheadAjaxSource) == "string") {
                    typeaheadAjax("", function (data) {
                        onTypeaheadAjaxSuccess(data, true);
                    });
                }
            }
        }

        /*
        This, combined with all the TypeaheadOverride junk earlier,
        seems to be some convoluted hack to change what happens when
        a typeahead item is selected. The simple updater function
        above accomplishes the same thing, so I have no idea what
        the point of this code is.

        var data = obj.data('typeahead');
        if (data) {
            // set the overrided handler
            data.select = $.proxy(tagManagerOptions.typeaheadOverrides.select,
                obj.data('typeahead'),
                tagManagerOptions.typeaheadOverrides);
        }
        */
    };

    var onTypeaheadAjaxSuccess = function(data, isSetTypeaheadSource, process) {
        // format data if it is an asp.net 3.5 response
        if ("d" in data) {
            data = data.d;
        }

        if (data && data.tags) {
            var allTags = [];
            allTags.length = 0;

            $.each(data.tags, function (key, val) {
                allTags.push(val.tag);
            });

            if (isSetTypeaheadSource) {
                setTypeaheadSource(allTags);
            }

            if ($.isFunction(process)) {
                process(allTags);
            }
        }
    };

    var setTypeaheadSource = function (source) {
      obj.data('active', true);
      obj.data('typeahead').source = source;
      tagManagerOptions.typeaheadSource = function(query, process) {
        process(source);
      };
      obj.data('active', false);
    };

    var typeaheadSelectedItem = function () {
      var listItemSelector = '.' + tagManagerOptions.typeaheadOverrides.selectedClass;
      var typeahead_data = obj.data('typeahead');
      return typeahead_data ? typeahead_data.$menu.find(listItemSelector) : undefined;
    };

    var typeaheadVisible = function () {
      return $('.typeahead:visible')[0];
    };

    var selectNewTags = function(allTags, process) {
        // Given a list of tags, filter out the
        // ones that we already have and pass
        // the new ones to process()
        var existingTags = $.map(obj.data("tlis"),
                                 function(tag) { return tag.toLowerCase(); });
        var newTags = [];
        $.each(allTags, function(i, tag) {
            if (-1 === $.inArray(tag.toLowerCase(), existingTags)) {
                newTags.push(tag);
            }
        });

        if (process) {
            // Find the active typeahead item and deactivate it.
            // This lets us start with no item selected.
            process(newTags).$menu.find('.active').removeClass('active');
        }

        return newTags;
    };

    var typeaheadSource = function(query, process) {
      if ($.isFunction(tagManagerOptions.typeaheadSource)) {
        tagManagerOptions.typeaheadSource(query, function(tags) {
          selectNewTags(tags, process);
        });
      }
    };

    var typeaheadAjax = function(query, success) {
        $.ajax({
            cache: false,
            type: tagManagerOptions.typeaheadAjaxMethod,
            contentType: "application/json",
            dataType: "json",
            url: tagManagerOptions.typeaheadAjaxSource,
            data: JSON.stringify({ typeahead: query }),
            success: success
        });
    };

    var typeaheadAjaxSource = function (query, process) {
      if (typeof (tagManagerOptions.typeaheadAjaxSource) == "string") {
        typeaheadAjax(query, function (data) {
          onTypeaheadAjaxSuccess(data, false, process);
        });
      }
    };

    var tagClasses = function () {
      // 1) default class (tm-tag)
      var cl = tagBaseClass;
      // 2) interpolate from input class: tm-input-xxx --> tm-tag-xxx
      if (obj.attr('class')) {
        $.each(obj.attr('class').split(' '), function(index, value) {
          if (value.indexOf(inputBaseClass+'-') != -1){
            cl += ' ' + tagBaseClass + value.substring(inputBaseClass.length);
          }
        });
      }
      // 3) tags from tagClass option
      cl += (tagManagerOptions.tagClass ? ' ' + tagManagerOptions.tagClass : '');
      return cl;
    };

    var trimTag = function (tag) {
      tag = $.trim(tag);

      if (tagManagerOptions.collapseWhitespace) {
        tag = tag.replace(/\s+/, " ");
      }

      // truncate at the first delimiter char
      var i = 0;
      for (i; i < tag.length; i++) {
        if ($.inArray(tag.charCodeAt(i), delimiterChars) != -1) break;
      }
      return tag.substring(0, i);
    };

    var popTag = function () {
      var tlis = obj.data("tlis");
      var tlid = obj.data("tlid");

      if (tlid.length > 0) {
        var tagId = tlid.pop();
        tlis.pop();
        // console.log("TagIdToRemove: " + tagId);
        $("#" + objName + "_" + tagId).remove();
        onTagsChanged();
        // console.log(tlis);
      }
    };

    var empty = function () {
      var tlis = obj.data("tlis");
      var tlid = obj.data("tlid");

      while (tlid.length > 0) {
        var tagId = tlid.pop();
        tlis.pop();
        // console.log("TagIdToRemove: " + tagId);
        $("#" + objName + "_" + tagId).remove();
        onTagsChanged();
        // console.log(tlis);
      }
    };

    var onTagsChanged = function () {
        if (obj.data('typeahead')) {
          obj.data('typeahead').$menu.remove();
        }

        var tlis = obj.data("tlis");

        var lhiddenTagList = obj.data("lhiddenTagList");
        if (lhiddenTagList) {
            $(lhiddenTagList).val(tlis.join(baseDelimiter)).change();
        }

        obj.trigger('tags:refresh', [tlis]);
    };

    var spliceTag = function (tagId) {
      var tlis = obj.data("tlis");
      var tlid = obj.data("tlid");

      var p = $.inArray(tagId, tlid);

      // console.log("TagIdToRemove: " + tagId);
      // console.log("position: " + p);

      if (-1 != p) {
        var tag = tlis[p];
        var el = $("#" + objName + "_" + tagId);
        if (el) el.remove();
        tlis.splice(p, 1);
        tlid.splice(p, 1);
        onTagsChanged();
        // console.log(tlis);

        if (tagManagerOptions.AjaxPush != null) {
          $.post(tagManagerOptions.AjaxPush, $.extend({ remove: tag }, tagManagerOptions.AjaxPushParameters));
        }
      }

      if (tagManagerOptions.maxTags > 0 && tlis.length < tagManagerOptions.maxTags) {
        obj.show();
      }
    };

    var pushAllTags = function (e, tagstring) {
      if (tagManagerOptions.AjaxPushAllTags) {
        $.post(tagManagerOptions.AjaxPush, { tags: tagstring });
      }
    };

    var tagInArray = function(tag, array) {
      return $.inArray(tag.toLowerCase(),
                       $.map(array, function(t) { return t.toLowerCase(); }));
    }

    var getTagId = function (tag) {
        tag = trimTag(tag);
        var i = tagInArray(tag, obj.data("tlis"));
        if (i === -1) {
            return null;
        } else {
            return obj.data("tlid")[i];
        }
    };

    var getAvailableTags = function(query, process) {
      if ($.isFunction(tagManagerOptions.typeaheadSource)) {
        tagManagerOptions.typeaheadSource(query, process);
      } else {
        process([]);
      }
    };

    var pushTag = function (tag, prefill) {
      tag = trimTag(tag);

      if (!tag || tag.length <= 0) return;

      if (tagManagerOptions.CapitalizeFirstLetter && tag.length > 1) {
        tag = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
      }

      // call the validator (if any) and do not let the tag pass if invalid
      if (!prefill && obj.data('validator') && !obj.data('validator')(tag)) {
          if (obj.data('onInvalid'))
                obj.data('onInvalid')(obj, tag);
          return;
      }

      var tlis = obj.data("tlis");
      var tlid = obj.data("tlid");

      // dont accept new tags beyond the defined maximum
      if (tagManagerOptions.maxTags > 0 && tlis.length >= tagManagerOptions.maxTags) return;

      var pTagId = getTagId(tag);

      if (pTagId != null) {
        for (var i = 0; i < 6; ++i) {
          $("#" + objName + "_" + pTagId).queue(function(next) {
            $(this).toggleClass('sde-tag-highlight');
            next();
          }).delay(100);
        }
      } else {
        getAvailableTags(tag, function(availableTags) {
          if (!prefill) {
            var i = tagInArray(tag, availableTags);
            if (i != -1) {
              tag = availableTags[i];
            }
          }

          var max = Math.max.apply(null, tlid);
          max = max == -Infinity ? 0 : max;

          var tagId = ++max;

          tlis.push(tag);
          tlid.push(tagId);

          if (!prefill && tagManagerOptions.AjaxPush != null) {
            $.post(tagManagerOptions.AjaxPush, $.extend({ add: tag }, tagManagerOptions.AjaxPushParameters));
          }

          var newTagId = objName + '_' + tagId;
          var newTagRemoveId = objName + '_Remover_' + tagId;
          var escaped = $("<span></span>").text(tag).html();

          var html = '<span class="' + tagClasses() + '" id="' + newTagId + '">';
          html += '<span>' + escaped + '</span>';
          if (tagManagerOptions.editable) {
            html += '<a href="#" class="tm-tag-remove" id="' + newTagRemoveId + '" TagIdToRemove="' + tagId + '">';
            html += tagManagerOptions.tagCloseIcon + '</a>';
          }
          html += '</span> ';
          var $el = $(html)

          if (tagManagerOptions.tagsContainer != null) {
            $(tagManagerOptions.tagsContainer).append($el);
          } else {
            obj.before($el);
          }

          $el.find("#" + newTagRemoveId).on("click", obj, function (e) {
            e.preventDefault();
            var TagIdToRemove = parseInt($(this).attr("TagIdToRemove"));
            spliceTag(TagIdToRemove, e.data);
          });

          onTagsChanged();

          if (tagManagerOptions.maxTags > 0 && tlis.length >= tagManagerOptions.maxTags) {
            obj.hide();
          }
        });
      }
      obj.val('').trigger('cleared');
    };

    var prefill = function (pta) {
      $.each(pta, function (key, val) {
        pushTag(val, true);
      });
    };

    var killEvent = function (e) {
      e.cancelBubble = true;
      e.returnValue = false;
      e.stopPropagation();
      e.preventDefault();
    };

    var keyInArray = function (e, ary) {
      return $.inArray(e.which, ary) != -1
    };

    var applyDelimiter = function (e) {
      if (!tagManagerOptions.onlyTagList) {
        var taItem = typeaheadSelectedItem();
        var taVisible = typeaheadVisible();
        if (!(e.which==13 && taItem && taVisible)) {
          pushTag(obj.val());
        }
      }
      e.preventDefault();
    };

    return this.each(function () {

      if (typeof options == 'string') {
        //restore options state before public method calls
        tagManagerOptions = obj.data('tagManager-options');
        switch (options) {
          case "empty":
            empty();
            break;
          case "popTag":
            popTag();
            break;
          case "pushTag":
            pushTag(tagToManipulate);
            break;
        }
        return;
      }

      // prevent double-initialization of TagManager
      if ($(this).data('tagManager')){ return false; }
      $(this).data('tagManager', true);

      // store instance-specific data in the DOM object
      var tlis = new Array();
      var tlid = new Array();
      obj.data("tlis", tlis); //list of string tags
      obj.data("tlid", tlid); //list of ID of the string tags

      if (tagManagerOptions.hiddenTagListId == null) { /* if hidden input not given default activity */
        var hiddenTag = $("input[name='" + tagManagerOptions.hiddenTagListName + "']");
        if (hiddenTag.length > 0) {
          hiddenTag.remove();
        }

        var html = "";
        html += "<input name='" + tagManagerOptions.hiddenTagListName + "' type='hidden' value=''/>";
        obj.after(html);
        obj.data("lhiddenTagList",
          obj.siblings("input[name='" + tagManagerOptions.hiddenTagListName + "']")[0]
        );
      } else {
        obj.data("lhiddenTagList", $('#' + tagManagerOptions.hiddenTagListId))
      }

      if (tagManagerOptions.typeahead) {
        setupTypeahead();
      }

      if (tagManagerOptions.AjaxPushAllTags) {
        obj.on('tags:refresh', pushAllTags);
      }

      // hide popovers on focus and keypress events
      obj.on('focus keypress', function (e) {
        if ($(this).data('popover')) {
          $(this).popover('hide');
        }
      });

      // handle ESC (keyup used for browser compatibility)
      if (tagManagerOptions.isClearInputOnEsc) {
        obj.on('keyup', function (e) {
          if (e.which == 27) {
            // console.log('esc detected');
            $(this).val('').trigger('cleared');
            killEvent(e);
          }
        });
      }

      obj.on('keypress', function (e) {
        // push ASCII-based delimiters
        if (keyInArray(e, delimiterChars)) {
          applyDelimiter(e);
        }
      });

      obj.on('keydown', function (e) {
        // disable ENTER
        if (e.which == 13) {
          if (tagManagerOptions.preventSubmitOnEnter) {
            killEvent(e);
          }
        }

        // push key-based delimiters (includes <enter> by default)
        if (keyInArray(e, delimiterKeys)) {
            var tag = trimTag(obj.val());

            // should pass tab key if current field is empty
            if ((!tag || tag.length <= 0) && e.which == 9)
                return;

            applyDelimiter(e);
        }
      });

      // BACKSPACE (keydown used for browser compatibility)
      if (tagManagerOptions.deleteTagsOnBackspace) {
        obj.on('keydown', function (e) {
          if (keyInArray(e, backspace)) {
            // console.log("backspace detected");
            if ($(this).val().length <= 0) {
              popTag();
              killEvent(e);
            }
          }
        });
      }

      obj.change(function (e) {

        if (!/webkit/.test(navigator.userAgent.toLowerCase())) { $(this).focus(); } // why?

        var taItem = typeaheadSelectedItem();
        var taVisible = typeaheadVisible();

        if (taItem && taVisible) {
          taItem.removeClass(tagManagerOptions.typeaheadOverrides.selectedClass);
          pushTag(taItem.attr('data-value'));
          // console.log('change: pushTypeAheadTag ' + tag);
        }
        /* unimplemented mode to push tag on blur
         else if (tagManagerOptions.pushTagOnBlur) {
         console.log('change: pushTagOnBlur ' + tag);
         pushTag($(this).val());
         } */
        killEvent(e);
      });

      if (tagManagerOptions.prefilled != null) {
        if (typeof (tagManagerOptions.prefilled) == "object") {
          prefill(tagManagerOptions.prefilled);
        } else if (typeof (tagManagerOptions.prefilled) == "string") {
          prefill(tagManagerOptions.prefilled.split(baseDelimiter));
        } else if (typeof (tagManagerOptions.prefilled) == "function") {
          prefill(tagManagerOptions.prefilled());
        }
      } else if (tagManagerOptions.hiddenTagListId != null) {
        prefill($('#' + tagManagerOptions.hiddenTagListId).val().split(baseDelimiter));
      }

      //store options state for further public method calls
      obj.data('tagManager-options', tagManagerOptions);
    });
  }
})(jQuery);
