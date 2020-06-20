<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class FeatureModel extends Model
{
    protected $fillable = [
        'name', 'project_id', 'xml'
    ];

    public function features()
    {
        return $this->hasMany('App\Feature')->orderBy('height', 'asc');
    }

    public function project()
    {
        return $this->belongsTo('App\Project', 'project_id');
    }

    public function features_order()
    {
        $features = [];
        $core = Feature::where('feature_model_id', $this->id)->where('height', '0')->first();

        $features[] = $core;
        $features = $this->addChildren($core, $features);

        return $features;
    }

    function addChildren(Feature $parent, $features)
    {
        $children = $parent->children();
        foreach ($children as $c) {
            $newF = Feature::find($c->id);
            $features[] = $newF;
            if ($newF->children()->count() > 0) {
                $features =  $this->addChildren($newF, $features);
            }
        }
        return $features;
    }


    public function generate_xml()
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?><featureModel><properties/><struct>';
        $features = [];
        $core = Feature::where('feature_model_id', $this->id)->where('height', '0')->first();
        $features[] = $core;



        $xml = $this->generate_xml_children($core, $features, $xml);

        $xml = $xml . '</struct><constraints></constraints><calculations Auto="true" Constraints="true" Features="true" Redundant="true" Tautology="true"/>
        	<comments/>	<featureOrder userDefined="false"/></featureModel>';
        return preg_replace('/\\s\\s+/', ' ', ($xml));
    }


    function generate_xml_children(Feature $parent, $features, $xml)
    {
        $parent_xml = '';
        $abstract = '';
        $relation = 'and';
        $mandatory = false;
        if ($parent->type == 'Mandatory') {
            $mandatory = true;
        }
        if ($parent->abstract) {
            $abstract = 'abstract="true"';
        }
        $parent_xml = '<'.$relation.' ' . $abstract . ' mandatory="' . $mandatory . '" name="' . $parent->name . '" description="' . $parent->description . '">';

        $xml = $xml . $parent_xml;

        $children = $parent->children();
        foreach ($children as $c) {
            $newF = Feature::find($c->id);
            $features[] = $newF;
            if ($newF->children()->count() > 0) {
                $xml =  $this->generate_xml_children($newF, $features, $xml);
            } else {
                $mandatory = false;
                $abstract = '';
                if ($newF->type == 'Mandatory') {
                    $mandatory = true;
                }
                if ($newF->abstract) {
                    $abstract = 'abstract="true"';
                }
                $xml = $xml . '<feature ' . $abstract . ' mandatory="' . $mandatory . '" name="' . $newF->name . '" description="' . $newF->description . '"/>';
            }
        }
        $xml = $xml . '</'.$relation.'>';
        return $xml;
    }
}
